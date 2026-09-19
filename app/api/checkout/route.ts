import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth/roles';
import { fail, parseBody, TOO_MANY } from '@/lib/auth/http';
import { clientIp, rateLimit } from '@/lib/rateLimit';
import { createSupabaseAdminClient, supabaseAdminConfigured } from '@/lib/supabase/admin';
import { stripeConfigured } from '@/lib/stripe';
import { checkoutSchema } from '@/lib/ticketing/schemas';
import { getTicketingSettings } from '@/lib/ticketing/settings';
import { editionForSlug } from '@/lib/ticketing/guard';
import { createCheckoutSession, expireSessions, reserveOrder } from '@/lib/ticketing/checkout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/checkout — réserve les places (atomique, 15 min) puis crée la session Stripe.
// Le corps ne contient AUCUN prix : tout est relu en base.
export async function POST(req: Request) {
  if (!stripeConfigured() || !supabaseAdminConfigured()) {
    return fail('Le paiement en ligne n’est pas disponible pour le moment.', 503);
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
  const reserved = await reserveOrder(db, {
    input,
    userId: session.userId,
    eventTitle: edition.name, // résolu ICI, jamais fourni par le navigateur
    buyer: { email: session.email, first_name, last_name, phone },
    settings,
  });
  if (!reserved.ok) return fail(reserved.message, reserved.status);
  const { order } = reserved;

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
