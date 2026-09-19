import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, parseBody } from '@/lib/auth/http';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getStripe, stripeConfigured } from '@/lib/stripe';
import { refundSchema } from '@/lib/ticketing/schemas';
import { requireBilletterieAdmin } from '@/lib/ticketing/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REFUND_ERRORS: Record<string, { status: number; message: string }> = {
  ORDER_NOT_FOUND: { status: 404, message: 'Commande introuvable.' },
  NOT_REFUNDABLE: { status: 409, message: 'Cette commande n’est pas remboursable (non payée ou déjà intégralement remboursée).' },
  REFUND_EXCEEDS: { status: 409, message: 'Le montant dépasse ce qui reste remboursable.' },
};

// POST { request_id, amount_cents?, reason?, cancel_ticket_ids? }
//  * amount_cents absent = remboursement TOTAL du reste (frais de service compris) ;
//  * request_id = clé d'idempotence : un double clic ne rembourse pas deux fois ;
//  * la ligne de remboursement est réservée en base AVANT l'appel Stripe ;
//  * cancel_ticket_ids : billets à annuler en cas de remboursement partiel.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireBilletterieAdmin();
  if (!guard.ok) return guard.res;
  if (!stripeConfigured()) return fail('Stripe n’est pas configuré.', 503);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return fail('Commande invalide.');
  const parsed = await parseBody(req, refundSchema);
  if ('res' in parsed) return parsed.res;
  const { request_id, amount_cents, reason, cancel_ticket_ids } = parsed.data;

  const db = createSupabaseAdminClient();

  // les billets à annuler doivent appartenir à CETTE commande
  if (cancel_ticket_ids.length) {
    const { data: own } = await db.from('tickets').select('id').eq('order_id', id).in('id', cancel_ticket_ids);
    if ((own ?? []).length !== new Set(cancel_ticket_ids).size) return fail('Billet(s) étranger(s) à cette commande.', 400);
  }

  const key = `admin:${request_id}`;
  const begin = await db.rpc('begin_refund', {
    p_order: id, p_amount: amount_cents ?? null, p_reason: reason || 'Remboursement admin',
    p_actor: guard.actor, p_source: 'admin', p_key: key,
  });
  if (begin.error) {
    const known = REFUND_ERRORS[begin.error.message];
    if (known) return fail(known.message, known.status);
    console.error('[refund] begin_refund', begin.error);
    return fail('Remboursement impossible.', 500);
  }
  const r = (Array.isArray(begin.data) ? begin.data[0] : begin.data) as { refund_id: string; payment_intent: string; amount_cents: number };

  try {
    const refund = await getStripe().refunds.create(
      { payment_intent: r.payment_intent, amount: r.amount_cents, metadata: { order_id: id, refund_id: r.refund_id, source: 'admin' } },
      { idempotencyKey: key },
    );
    await db.rpc('finish_refund', { p_refund: r.refund_id, p_stripe_refund_id: refund.id, p_ok: true });
  } catch (e) {
    await db.rpc('finish_refund', { p_refund: r.refund_id, p_stripe_refund_id: null, p_ok: false });
    console.error('[refund] Stripe a refusé :', e);
    return fail(`Stripe a refusé le remboursement : ${e instanceof Error ? e.message : 'erreur inconnue'}`, 502);
  }

  const cancelled: string[] = [];
  for (const tid of cancel_ticket_ids) {
    const c = await db.rpc('admin_cancel_ticket', { p_actor: guard.actor, p_ticket: tid });
    if (!c.error) cancelled.push(tid);
  }
  const { data: order } = await db.from('orders').select('status, refunded_cents, total_cents').eq('id', id).single();
  return NextResponse.json({ ok: true, refunded_cents: r.amount_cents, order, cancelled_tickets: cancelled });
}
