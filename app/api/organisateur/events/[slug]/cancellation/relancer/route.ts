import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc } from '@/lib/organizer/data';
import { refundCancelledOrders, sendCancellationMessage } from '@/lib/organizer/cancellation-server';
import type { CancelEventInfo } from '@/lib/organizer/cancellation';
import { SLUG_RE } from '@/lib/ticketing/schemas';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface StateForRetry { id: string; refund_remaining: { id: string; number: string }[] }
interface RequeueResult { message_id: string | null; subject: string; body: string; reply_to: string; recipients: string[] }

// POST — reprend une annulation partiellement aboutie : relance les remboursements Stripe restants et renvoie le message
// d'excuse aux destinataires dont l'envoi avait échoué. Idempotent (clé de remboursement stable par commande ; les
// destinataires en échec repassent « en attente » en SQL avant d'être renvoyés).
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  if (!(await rateLimit(`cancel-retry:${g.s.userId}:${clientIp(req)}`, 20, 3600)).ok) return Response.json({ error: 'Trop de tentatives. Réessaie plus tard.' }, { status: 429 });

  const st = await orgRpc<StateForRetry | null>('org_cancellation_state', { p_actor: g.s.userId, p_slug: slug });
  if (!st.ok) return Response.json({ error: st.error.message }, { status: st.error.status });
  if (!st.data) return Response.json({ error: 'Cet évènement n’a pas été annulé.' }, { status: 404 });

  const refund = await refundCancelledOrders(st.data.id, st.data.refund_remaining, g.s.userId);

  const rq = await orgRpc<RequeueResult>('org_cancellation_requeue', { p_actor: g.s.userId, p_slug: slug });
  if (rq.ok && rq.data.message_id && rq.data.recipients.length > 0) {
    const ctx = await orgRpc<{ event: CancelEventInfo }>('org_cancel_context', { p_actor: g.s.userId, p_slug: slug });
    if (ctx.ok) await sendCancellationMessage(rq.data.message_id, rq.data.recipients, rq.data.subject, rq.data.body, rq.data.reply_to, ctx.data.event);
  }
  return Response.json({ ok: true, refunded: refund.refunded.length, refund_failed: refund.failed.length });
}
