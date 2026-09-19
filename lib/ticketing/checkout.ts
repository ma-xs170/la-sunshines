// Création d'une commande + session Stripe Checkout. SERVEUR UNIQUEMENT.
//
// Le navigateur n'envoie QUE des identifiants de tarifs, des quantités et des noms.
// Prix, frais, titre de l'événement et devise sont déterminés ici / en base.

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getStripe, connectOptions } from '@/lib/stripe';
import { siteUrl } from '@/lib/mail';
import type { CheckoutInput } from './schemas';
import type { TicketingSettings } from './settings';

export const CHECKOUT_ERRORS: Record<string, { status: number; message: string }> = {
  AUTH_REQUIRED: { status: 401, message: 'Connexion requise.' },
  CONSENT_REQUIRED: { status: 400, message: 'Tu dois accepter les CGV, la politique de remboursement et l’autorisation parentale.' },
  INVALID_ITEMS: { status: 400, message: 'Commande invalide.' },
  INVALID_PARTICIPANTS: { status: 400, message: 'Indique le nom de chaque participant.' },
  EVENT_NOT_ON_SALE: { status: 409, message: 'La billetterie de cet événement n’est pas ouverte.' },
  SALES_NOT_OPEN: { status: 409, message: 'Les ventes ne sont pas encore ouvertes.' },
  SALES_CLOSED: { status: 409, message: 'Les ventes sont terminées.' },
  TIER_UNAVAILABLE: { status: 409, message: 'Ce tarif n’est plus disponible.' },
  QUANTITY_LIMIT: { status: 400, message: 'Quantité maximale par commande dépassée.' },
  SOLD_OUT_TIER: { status: 409, message: 'Plus assez de places pour ce tarif. Actualise la page.' },
  SOLD_OUT_EVENT: { status: 409, message: 'Plus assez de places pour cet événement.' },
};

export interface ReservedOrder {
  order_id: string;
  order_number: string;
  subtotal_cents: number;
  fee_cents: number;
  total_cents: number;
  expires_at: string;
  superseded_sessions: string[];
}

export async function reserveOrder(
  db: SupabaseClient,
  args: {
    input: CheckoutInput;
    userId: string;
    eventTitle: string;
    buyer: { email: string; first_name: string; last_name: string; phone: string };
    settings: TicketingSettings;
  },
): Promise<{ ok: true; order: ReservedOrder } | { ok: false; status: number; message: string }> {
  const { data, error } = await db.rpc('reserve_tickets', {
    p_slug: args.input.slug,
    p_user: args.userId,
    p_event_title: args.eventTitle,
    p_items: args.input.items,
    p_buyer: args.buyer,
    p_fee_percent: args.settings.feePercent,
    p_fee_fixed_cents: args.settings.feeFixedCents,
    p_terms_version: args.settings.termsVersion || 'v1',
    p_guardian_consent: args.input.guardian_consent,
  });
  if (error) {
    const known = CHECKOUT_ERRORS[error.message];
    if (known) return { ok: false, ...known };
    console.error('[checkout] reserve_tickets a échoué :', error);
    return { ok: false, status: 500, message: 'Réservation impossible pour le moment. Réessaie.' };
  }
  const row = (Array.isArray(data) ? data[0] : data) as ReservedOrder | undefined;
  if (!row) return { ok: false, status: 500, message: 'Réservation impossible pour le moment. Réessaie.' };
  return { ok: true, order: row };
}

/** Libère (au mieux) des sessions Checkout devenues inutiles. Le stock, lui, n'en dépend pas. */
export async function expireSessions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const stripe = getStripe();
  await Promise.all(
    ids.map((id) => stripe.checkout.sessions.expire(id).catch(() => undefined)),
  );
}

/** Session Stripe Checkout construite à partir de ce que la BASE a enregistré. */
export async function createCheckoutSession(
  db: SupabaseClient,
  order: ReservedOrder,
  userId: string,
  email: string,
  eventSlug: string,
): Promise<{ url: string; id: string }> {
  const { data: items, error } = await db
    .from('order_items')
    .select('tier_name, unit_price_cents, quantity, event_title')
    .eq('order_id', order.order_id);
  if (error || !items?.length) throw new Error('Lignes de commande introuvables.');

  const lineItems = items.map((it) => ({
    quantity: it.quantity as number,
    price_data: {
      currency: 'eur',
      unit_amount: it.unit_price_cents as number,
      product_data: { name: `${it.event_title} — ${it.tier_name}` },
    },
  }));
  if (order.fee_cents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: order.fee_cents,
        product_data: { name: 'Frais de service' },
      },
    });
  }

  const base = siteUrl();
  const metadata = {
    order_id: order.order_id,
    order_number: order.order_number,
    user_id: userId,
    event_slug: eventSlug,
  };
  const session = await getStripe().checkout.sessions.create(
    {
      mode: 'payment',
      locale: 'fr',
      payment_method_types: ['card'],
      line_items: lineItems,
      customer_email: email,
      client_reference_id: order.order_id,
      metadata,
      payment_intent_data: { metadata, description: `Commande ${order.order_number}` },
      // Stripe impose 30 min minimum ; NOTRE réservation expire à 15 min (le stock ne dépend
      // pas de la session : un paiement tardif est revérifié puis remboursé si besoin).
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      success_url: `${base}/commande/succes?order=${order.order_number}`,
      cancel_url: `${base}/commande/annulee?order=${order.order_number}`,
      custom_text: {
        submit: {
          message:
            'TVA non applicable, art. 293 B du CGI. Billets nominatifs — conditions de remboursement : voir la politique de remboursement.',
        },
      },
    },
    { idempotencyKey: `checkout:${order.order_id}`, ...connectOptions(null) },
  );
  if (!session.url) throw new Error('Stripe n’a pas renvoyé d’URL de paiement.');
  return { url: session.url, id: session.id };
}
