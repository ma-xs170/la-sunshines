import { z } from 'zod';
import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc } from '@/lib/organizer/data';
import { notifyPublicationRequested } from '@/lib/organizer/publication-mail';
import { SLUG_RE } from '@/lib/ticketing/schemas';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { action: 'request' | 'cancel' } — demande (ou annule) la publication d'un évènement en brouillon. Organisation approuvée, checklist complète, rôle propriétaire / gestionnaire : tout est revérifié en SQL.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  const { slug } = await params;
  const body = z.object({ action: z.enum(['request', 'cancel']) }).safeParse(await req.json().catch(() => null));
  if (!SLUG_RE.test(slug) || !body.success) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  if (!(await rateLimit(`publication:${g.s.userId}:${clientIp(req)}`, 20, 3600)).ok) return Response.json({ error: 'Trop de demandes. Réessaie plus tard.' }, { status: 429 });
  if (body.data.action === 'cancel') {
    const r = await orgRpc('org_cancel_publication', { p_actor: g.s.userId, p_slug: slug });
    return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error.message }, { status: r.error.status });
  }
  const r = await orgRpc<{ id: string; slug: string; title: string; organizer: string }>('org_request_publication', { p_actor: g.s.userId, p_slug: slug });
  if (!r.ok) return Response.json({ error: r.error.message }, { status: r.error.status });
  await notifyPublicationRequested(r.data);
  return Response.json({ ok: true });
}
