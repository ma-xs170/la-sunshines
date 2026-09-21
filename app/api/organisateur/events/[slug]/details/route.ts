import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc } from '@/lib/organizer/data';
import { buildDetailsPatch } from '@/lib/organizer/event-pages';
import { revalidatePublicSite } from '@/lib/revalidate';
import { SLUG_RE } from '@/lib/ticketing/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET : page évènement complète (détails, sessions, lieux de l'organisation, vidéos). PUT : enregistre les champs envoyés (patch partiel).
// Rôle (owner / manager / admin) et appartenance à l'organisation revérifiés en SQL ; les valeurs sont nettoyées ici ET bornées par la base.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  const r = await orgRpc('org_event_details', { p_actor: g.s.userId, p_slug: slug });
  if (!r.ok) return Response.json({ error: r.error.message }, { status: r.error.status });
  return Response.json(r.data, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  const built = buildDetailsPatch(await req.json().catch(() => null));
  if ('error' in built) return Response.json({ error: built.error }, { status: 400 });
  const r = await orgRpc('org_event_details_save', { p_actor: g.s.userId, p_slug: slug, p_patch: built.patch });
  if (!r.ok) return Response.json({ error: r.error.message }, { status: r.error.status });
  revalidatePublicSite();   // la fiche publique change tout de suite
  return Response.json({ ok: true });
}
