import { z } from 'zod';
import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc } from '@/lib/organizer/data';
import { expireCancelledCheckouts, refundCancelledOrders, sendCancellationMessage } from '@/lib/organizer/cancellation-server';
import { SLUG_RE } from '@/lib/ticketing/schemas';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  mode: z.enum(['cancel', 'replace']),
  replacement: z.string().regex(SLUG_RE).optional(),
  reason: z.enum(['weather', 'permit', 'low_sales', 'other']),
  detail: z.string().trim().max(500).default(''),
  subject: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(2000),
});

interface CancelResult {
  cancellation_id: string; message_id: string | null; title: string; organizer_name: string; reply_to: string;
  starts_at: string; venue: string; recipients: string[]; orders: { id: string; number: string }[];
  refund_cents_planned: number; pending_sessions: string[]; tickets_cancelled: number;
}

// POST { mode, replacement?, reason, detail?, subject, body } — annule DÉFINITIVEMENT l'évènement (irréversible), avec la raison
// obligatoire et le message aux participants choisis par l'organisateur (propriétaire uniquement). Tout est revérifié en SQL, en
// une seule transaction (org_cancel_event) : évènement, billets, commandes en attente. Les effets externes (remboursements Stripe
// des commandes payées, expiration des paiements en cours, envoi du message) suivent, chacun best-effort et rejouable en cas d'échec
// partiel (voir /cancellation/relancer).
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  if (!(await rateLimit(`cancel-event:${g.s.userId}:${clientIp(req)}`, 10, 3600)).ok) return Response.json({ error: 'Trop de tentatives. Réessaie plus tard.' }, { status: 429 });

  const { mode, replacement, reason, detail, subject, body } = parsed.data;
  const r = await orgRpc<CancelResult>('org_cancel_event', {
    p_actor: g.s.userId, p_slug: slug, p_mode: mode, p_replacement: mode === 'replace' ? (replacement ?? null) : null,
    p_reason: reason, p_detail: detail, p_subject: subject, p_body: body,
  });
  if (!r.ok) return Response.json({ error: r.error.message }, { status: r.error.status });
  const d = r.data;

  await expireCancelledCheckouts(d.pending_sessions);
  const refund = await refundCancelledOrders(d.cancellation_id, d.orders, g.s.userId);
  if (d.message_id) {
    await sendCancellationMessage(d.message_id, d.recipients, subject, body, d.reply_to, { title: d.title, starts_at: d.starts_at, venue: d.venue, organizer_name: d.organizer_name });
  }

  return Response.json({ ok: true, tickets_cancelled: d.tickets_cancelled, refunded: refund.refunded.length, refund_failed: refund.failed.length });
}
