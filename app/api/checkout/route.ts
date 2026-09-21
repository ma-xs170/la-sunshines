import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth/roles';
import { fail, parseBody, TOO_MANY } from '@/lib/auth/http';
import { clientIp, rateLimit } from '@/lib/rateLimit';
import { createSupabaseAdminClient, supabaseAdminConfigured } from '@/lib/supabase/admin';
import { stripeConfigured } from '@/lib/stripe';
import { checkoutSchema } from '@/lib/ticketing/schemas';
import { getTicketingSettings } from '@/lib/ticketing/settings';
import { editionForSlug } from '@/lib/ticketing/guard';
import { applyPromo, checkoutKind, createCheckoutSession, eventFeeConfig, expireSessions, feeSettingsFor, recordAbsorbedFee, requestedSubtotal, reserveFreeOrder, reserveOrder } from '@/lib/ticketing/checkout';
import { computeFee } from '@/lib/ticketing/fees';
import { formatEuro } from '@/lib/ticketing/time';
import { afterOrderPaid } from '@/lib/ticketing/order-mail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/checkout — réserve les places (atomique, 15 min) puis crée la session Stripe.
// Le corps ne contient AUCUN prix : tout est relu en base.
// Commande à 0 € : JAMAIS de Stripe (minimum 0,50 €). Réservation + confirmation en une transaction SQL,
// billets QR + e-mail immédiats. Panier mixte : Stripe n'encaisse que la partie payante.
export async function POST(req: Request) {
  if (!supabaseAdminConfigured()) {
    return fail('La billetterie en ligne n’est pas disponible pour le moment.', 503);
  }
  const guard = await requireApiRole('customer');
  if (!guard.ok) return guard.res;
  const { session } = guard;

  const rl = await rateLimit(`checkout:${session.userId}:${clientIp(req)}`, 10, 600, { failClosed: true });
  if (!rl.ok) return fail(TOO_MANY, 429);

  const parsed = await parseBody(req, checkoutSchema);
  if ('res' in parsed) return parsed.res;
  const input = parsed.data;

  // Interrupteur global : tant que l'admin n'a pas activé la billetterie interne, rien ne s'achète.
  const settings = await getTicketingSettings(true);
  if (settings.mode !== 'native') return fail('La billetterie en ligne n’est pas ouverte.', 403);

  const edition = editionForSlug(input.slug);
  if (!edition) return fail('Événement introuvable.', 404);

  const { first_name, last_name, phone } = session.profile;
  if (!first_name || !last_name || !phone) {
    return fail('Complète ton profil (prénom, nom, téléphone) avant de réserver.', 400);
  }

  const db = createSupabaseAdminClient();

  // ---- Commande 100 % gratuite : sans Stripe ----
  if ((await checkoutKind(db, input)) === 'free') {
    // limitation de fréquence dédiée (plus stricte : le billet gratuit est une cible d'abus)
    const rlFree = await rateLimit(`checkout-free:${session.userId}`, 5, 600, { failClosed: true });
    const rlIp = await rateLimit(`checkout-free-ip:${clientIp(req)}`, 20, 600, { failClosed: true });
    if (!rlFree.ok || !rlIp.ok) return fail(TOO_MANY, 429);
    const free = await reserveFreeOrder(db, {
      input,
      userId: session.userId,
      eventTitle: edition.name,
      buyer: { email: session.email, first_name, last_name, phone },
      settings,
    });
    if (!free.ok) return fail(free.message, free.status);
    // l'échec d'envoi de l'e-mail ne fait jamais échouer la commande (billets dans « Mes billets »)
    await afterOrderPaid(db, free.order.order_id);
    return NextResponse.json({
      free: true,
      order_number: free.order.order_number,
      redirect: `/commande/succes?order=${free.order.order_number}`,
    });
  }

  if (!stripeConfigured()) return fail('Le paiement en ligne n’est pas disponible pour le moment.', 503);

  // frais de l'évènement (surcharges, mode « inclus dans le prix ») et montant minimum de commande : relus en base
  const feeCfg = await eventFeeConfig(db, input.slug);
  const fee = feeSettingsFor(feeCfg, settings);
  if (feeCfg.min_order_cents > 0) {
    const sub = await requestedSubtotal(db, input);
    if (sub !== null && sub > 0 && sub < feeCfg.min_order_cents) return fail(`Le montant minimum d’une commande pour cet évènement est de ${formatEuro(feeCfg.min_order_cents)}.`, 400);
  }
  const reserved = await reserveOrder(db, {
    input,
    userId: session.userId,
    eventTitle: edition.name, // résolu ICI, jamais fourni par le navigateur
    buyer: { email: session.email, first_name, last_name, phone },
    settings: fee.settings,
  });
  if (!reserved.ok) return fail(reserved.message, reserved.status);
  let order = reserved.order;

  // code promo (facultatif) : appliqué juste après la réservation, avant tout paiement ; refus = commande libérée, rien n'est facturé
  if (input.promo_code) {
    const promo = await applyPromo(db, { orderId: order.order_id, userId: session.userId, code: input.promo_code, settings: fee.settings });
    if (!promo.ok) {
      await db.from('orders').update({ status: 'expired' }).eq('id', order.order_id).eq('status', 'pending');
      return fail(promo.message, promo.status);
    }
    order = { ...order, ...promo.totals };
  }

  // mode « inclus dans le prix » : la part de la plateforme est prise sur l'organisateur, le client ne paie que le prix affiché
  if (feeCfg.mode === 'included') await recordAbsorbedFee(db, order.order_id, computeFee(order.subtotal_cents, fee.rates));

  // un tarif est devenu gratuit entre-temps : jamais de session Stripe à 0 €
  if (order.total_cents <= 0) {
    await db.from('orders').update({ status: 'expired' }).eq('id', order.order_id).eq('status', 'pending');
    return fail('Les tarifs ont changé. Actualise la page et recommence.', 409);
  }

  // anciennes sessions du même client : nettoyage au mieux (le stock est déjà libéré)
  void expireSessions(order.superseded_sessions ?? []).catch(() => undefined);

  try {
    const checkout = await createCheckoutSession(db, order, session.userId, session.email, input.slug);
    await db
      .from('orders')
      .update({ stripe_checkout_session_id: checkout.id })
      .eq('id', order.order_id)
      .eq('status', 'pending');
    return NextResponse.json({ url: checkout.url, order_number: order.order_number });
  } catch (e) {
    console.error('[checkout] création de la session Stripe impossible :', e);
    // on libère immédiatement les places réservées
    await db.from('orders').update({ status: 'expired' }).eq('id', order.order_id).eq('status', 'pending');
    return fail('Le paiement n’a pas pu être initialisé. Réessaie dans un instant.', 502);
  }
}
