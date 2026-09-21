import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc } from '@/lib/organizer/data';
import { venueSchema } from '@/lib/organizer/event-pages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PUT : crée ou modifie un lieu de l'organisation `org` (rôle owner / manager / admin revérifié en SQL ; un lieu d'une autre organisation est introuvable).
export async function PUT(req: Request) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  const p = venueSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: p.error.issues[0]?.message ?? 'Requête invalide.' }, { status: 400 });
  const { org, id, ...data } = p.data;
  const r = await orgRpc<string>('org_venue_save', { p_actor: g.s.userId, p_org: org, p_id: id ?? null, p_data: data });
  if (!r.ok) return Response.json({ error: r.error.message }, { status: r.error.status });
  return Response.json({ ok: true, id: r.data });
}
