// Effets d'une annulation d'évènement une fois org_cancel_event validé en base : remboursements Stripe des commandes
// payées, expiration des paiements en cours, envoi du message aux participants. Chaque étape est BEST-EFFORT et
// individuellement rejouable (org_cancellation_requeue / nouvel appel avec la même clé d'idempotence) : un échec
// partiel n'annule jamais la décision déjà actée en base. SERVEUR UNIQUEMENT.
import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getStripe, stripeConfigured } from '@/lib/stripe';
import { expireSessions } from '@/lib/ticketing/checkout';
import { buildOrganizerMessage, sendOrganizerMessage } from '@/lib/organizer/mail';

export interface CancelOrderRef { id: string; number: string }
export interface CancelEventRef { title: string; starts_at: string; venue: string; organizer_name: string }

/** Coupe les paiements en cours (commandes en attente annulées par org_cancel_event) : Stripe n'accepte plus ces sessions. */
export async function expireCancelledCheckouts(sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0 || !stripeConfigured()) return;
  try { await expireSessions(sessionIds); } catch (e) { console.error('[cancellation] expiration des sessions :', e); }
}

/** Rembourse chaque commande payée (clé d'idempotence stable = rejeu sans double remboursement). Une commande en échec n'empêche pas les suivantes. */
export async function refundCancelledOrders(cancellationId: string, orders: CancelOrderRef[], actorId: string): Promise<{ refunded: string[]; failed: { order: string; error: string }[] }> {
  const refunded: string[] = []; const failed: { order: string; error: string }[] = [];
  if (orders.length === 0) return { refunded, failed };
  if (!stripeConfigured()) return { refunded, failed: orders.map((o) => ({ order: o.number, error: 'Stripe n’est pas configuré.' })) };
  const db = createSupabaseAdminClient();
  const stripe = getStripe();
  for (const o of orders) {
    const key = `cancel:${cancellationId}:${o.id}`;
    const begin = await db.rpc('begin_refund', { p_order: o.id, p_amount: null, p_reason: 'Évènement annulé', p_actor: actorId, p_source: 'event_cancelled', p_key: key });
    if (begin.error) { failed.push({ order: o.number, error: begin.error.message }); continue; }
    const r = (Array.isArray(begin.data) ? begin.data[0] : begin.data) as { refund_id: string; payment_intent: string; amount_cents: number; already_done: boolean };
    if (r.already_done) { refunded.push(o.number); continue; }
    try {
      const refund = await stripe.refunds.create(
        { payment_intent: r.payment_intent, amount: r.amount_cents, metadata: { order_id: o.id, refund_id: r.refund_id, source: 'event_cancelled' } },
        { idempotencyKey: key },
      );
      await db.rpc('finish_refund', { p_refund: r.refund_id, p_stripe_refund_id: refund.id, p_ok: true });
      refunded.push(o.number);
    } catch (e) {
      await db.rpc('finish_refund', { p_refund: r.refund_id, p_stripe_refund_id: null, p_ok: false });
      failed.push({ order: o.number, error: e instanceof Error ? e.message : 'Stripe a refusé le remboursement.' });
    }
  }
  return { refunded, failed };
}

/** Envoie le message d'excuse aux destinataires figés par org_cancel_event (ou par la reprise). Best-effort : ne fait jamais échouer l'appelant. */
export async function sendCancellationMessage(messageId: string, recipients: string[], subject: string, body: string, replyTo: string, ev: CancelEventRef): Promise<void> {
  if (recipients.length === 0) return;
  try {
    const mail = buildOrganizerMessage({ subject, body, eventTitle: ev.title, startsAt: ev.starts_at, venue: ev.venue, organizerName: ev.organizer_name, replyTo });
    await sendOrganizerMessage(messageId, recipients, mail, replyTo);
  } catch (e) { console.error('[cancellation] envoi du message :', e); }
}
