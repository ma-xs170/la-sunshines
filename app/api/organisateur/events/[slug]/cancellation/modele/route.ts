import { z } from 'zod';
import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc } from '@/lib/organizer/data';
import { SLUG_RE } from '@/lib/ticketing/schemas';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REASONS = ['weather', 'permit', 'low_sales', 'other'] as const;
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), reason: z.enum(REASONS), subject: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(1800) }),
  z.object({ action: z.literal('reset'), reason: z.enum(REASONS) }),
]);

// POST { action: 'save', reason, subject, body } | { action: 'reset', reason } — modèle d'excuse propre à l'organisation
// pour une raison d'annulation donnée (surcharge le modèle par défaut du site ; « reset » y revient). Propriétaire uniquement.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  if (!(await rateLimit(`cancel-tpl:${g.s.userId}:${clientIp(req)}`, 30, 3600)).ok) return Response.json({ error: 'Trop de tentatives. Réessaie plus tard.' }, { status: 429 });

  const r = parsed.data.action === 'save'
    ? await orgRpc('org_save_cancellation_template', { p_actor: g.s.userId, p_slug: slug, p_reason: parsed.data.reason, p_subject: parsed.data.subject, p_body: parsed.data.body })
    : await orgRpc('org_reset_cancellation_template', { p_actor: g.s.userId, p_slug: slug, p_reason: parsed.data.reason });
  return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error.message }, { status: r.error.status });
}
