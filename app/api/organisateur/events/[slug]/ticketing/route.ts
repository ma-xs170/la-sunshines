import { z } from 'zod';
import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc } from '@/lib/organizer/data';
import { parseBizoukCode } from '@/lib/bizoukEmbed';
import { SLUG_RE } from '@/lib/ticketing/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { mode, bizouk_code? } — change la méthode de billetterie d'un évènement (gestionnaire de l'organisation ou admin). Le code Bizouk est analysé : seul l'identifiant est conservé.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  const { slug } = await params;
  const body = z.object({ mode: z.enum(['internal', 'bizouk', 'none']), bizouk_code: z.string().max(4000).optional() }).safeParse(await req.json().catch(() => null));
  if (!SLUG_RE.test(slug) || !body.success) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  let id: string | null = null;
  if (body.data.mode === 'bizouk') { const p = parseBizoukCode(body.data.bizouk_code); if (!p.ok) return Response.json({ error: p.message }, { status: 400 }); id = p.eventId; }
  const r = await orgRpc('org_set_ticketing', { p_actor: g.s.userId, p_slug: slug, p_mode: body.data.mode, p_bizouk_event_id: id });
  if (!r.ok) return Response.json({ error: r.error.message }, { status: r.error.status });
  return Response.json({ ok: true });
}
