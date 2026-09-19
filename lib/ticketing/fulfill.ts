// Traitement des événements Stripe. SERVEUR UNIQUEMENT.
// Appelé par le webhook APRÈS vérification de signature et claim d'idempotence.

import 'server-only';
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { newTicketCode } from './tokens';
import { afterOrderPaid, afterStockLost } from './order-mail';

export type HandleResult = { ok: true; note?: string } | { ok: false; error: string };

interface Participant {
  first_name: string;
  last_name: string;
}

/** Un billet par place, avec un code HMAC neuf ; les noms viennent des participants saisis avant paiement. */
async function buildTickets(db: SupabaseClient, orderId: string) {
  const { data: items, error } = await db
    .from('order_items')
    .select('id, quantity, participants')
    .eq('order_id', orderId);
  if (error || !items) throw new Error('Lignes de commande illisibles.');
  const tickets: { id: string; order_item_id: string; code: string; first_name: string; last_name: string }[] = [];
  for (const it of items) {
    const people = (it.participants as Participant[]) ?? [];
    for (let i = 0; i < it.quantity; i++) {
      tickets.push({
        id: randomUUID(),
        order_item_id: it.id,
        code: newTicketCode(),
        first_name: people[i]?.first_name ?? '',
        last_name: people[i]?.last_name ?? '',
      });
    }
  }
  return tickets;
}

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === 'string' ? v : v?.id ?? null);

/**
 * Paiement STOCK PERDU : la réservation avait expiré et les places ont été reprises.
 * Remboursement du TOTAL payé (frais compris), clé d'idempotence = stock_lost:<commande> :
 * un webhook rejoué ne rembourse jamais deux fois (clé unique en base + clé Stripe).
 */
async function refundStockLost(db: SupabaseClient, orderId: string): Promise<void> {
  const key = `stock_lost:${orderId}`;
  const { data, error } = await db.rpc('begin_refund', {
    p_order: orderId,
    p_amount: null, // null = tout ce qui a été payé
    p_reason: 'Places épuisées pendant le paiement',
    p_actor: null,
    p_source: 'stock_lost',
    p_key: key,
  });
  if (error) throw new Error(`begin_refund : ${error.message}`);
  const r = (Array.isArray(data) ? data[0] : data) as { refund_id: string; payment_intent: string; amount_cents: number };
  try {
    const refund = await getStripe().refunds.create(
      { payment_intent: r.payment_intent, amount: r.amount_cents, metadata: { order_id: orderId, reason: 'stock_lost' } },
      { idempotencyKey: key },
    );
    await db.rpc('finish_refund', { p_refund: r.refund_id, p_stripe_refund_id: refund.id, p_ok: true });
  } catch (e) {
    await db.rpc('finish_refund', { p_refund: r.refund_id, p_stripe_refund_id: null, p_ok: false });
    throw e; // 500 → Stripe rejoue le webhook ; begin_refund réactive la même ligne
  }
}

export async function handleStripeEvent(db: SupabaseClient, event: Stripe.Event): Promise<HandleResult> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status !== 'paid') return { ok: true, note: 'paiement non finalisé, ignoré' };
      const orderId = session.client_reference_id ?? session.metadata?.order_id ?? null;
      if (!orderId) return { ok: true, note: 'session sans commande (événement de test), ignoré' };

      const { data, error } = await db.rpc('fulfill_order', {
        p_order: orderId,
        p_session: session.id,
        p_pi: idOf(session.payment_intent),
        p_amount: session.amount_total,
        p_tickets: await buildTickets(db, orderId),
      });
      if (error) throw new Error(`fulfill_order : ${error.message}`);

      switch (data as string) {
        case 'fulfilled':
        case 'already_paid':
          // l'échec d'envoi de l'email ne fait JAMAIS échouer le webhook (voir order-mail.ts)
          await afterOrderPaid(db, orderId);
          return { ok: true };
        case 'stock_lost':
          await refundStockLost(db, orderId);
          await afterStockLost(db, orderId);
          return { ok: true, note: 'stock épuisé : remboursement total effectué' };
        case 'amount_mismatch':
          console.error('[stripe] montant incohérent pour la commande', orderId, session.amount_total);
          return { ok: false, error: `Montant Stripe (${session.amount_total}) ≠ commande ${orderId} : à vérifier à la main` };
        case 'not_found':
          return { ok: true, note: 'commande inconnue, ignoré' };
        default:
          return { ok: false, error: `Résultat fulfill_order inattendu : ${String(data)}` };
      }
    }

    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session;
      const { error } = await db.rpc('expire_order_by_session', { p_session: session.id });
      if (error) throw new Error(`expire_order_by_session : ${error.message}`);
      return { ok: true };
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      const pi = idOf(charge.payment_intent);
      if (!pi) return { ok: true, note: 'charge sans payment_intent, ignoré' };
      const { error } = await db.rpc('apply_order_refund', {
        p_pi: pi,
        p_refunded_total: charge.amount_refunded, // total ABSOLU : un rejeu ne double rien
      });
      if (error) throw new Error(`apply_order_refund : ${error.message}`);
      return { ok: true };
    }

    default:
      return { ok: true, note: `événement ${event.type} ignoré` };
  }
}
