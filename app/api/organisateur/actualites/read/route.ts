import { z } from 'zod';
import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc } from '@/lib/organizer/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { id? } — marque une actualité (ou toutes, sans id) comme lue POUR L'UTILISATEUR COURANT.
export async function POST(req: Request) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  const body = z.object({ id: z.uuid().optional() }).safeParse(await req.json().catch(() => ({})));
  if (!body.success) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  const r = await orgRpc<number>('news_mark_read', { p_actor: g.s.userId, p_post: body.data.id ?? null });
  if (!r.ok) return Response.json({ error: r.error.message }, { status: r.error.status });
  return Response.json({ ok: true, marked: r.data });
}
