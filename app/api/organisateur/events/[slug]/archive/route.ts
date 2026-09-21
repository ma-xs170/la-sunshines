import { z } from 'zod';
import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc } from '@/lib/organizer/data';
import { SLUG_RE } from '@/lib/ticketing/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/organisateur/events/[slug]/archive { archived } — archive / désarchive côté organisateur (owner, manager, admin). Journalisé.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  const { slug } = await params;
  const body = z.object({ archived: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!SLUG_RE.test(slug) || !body.success) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  const r = await orgRpc('org_archive_event', { p_actor: g.s.userId, p_slug: slug, p_archived: body.data.archived });
  if (!r.ok) return Response.json({ error: r.error.message }, { status: r.error.status });
  return Response.json({ ok: true });
}
