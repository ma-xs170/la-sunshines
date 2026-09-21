import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc } from '@/lib/organizer/data';
import { sessionSchema } from '@/lib/organizer/event-pages';
import { revalidatePublicSite } from '@/lib/revalidate';
import { SLUG_RE } from '@/lib/ticketing/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PUT : crée (sans id) ou modifie une session. Changer la date alors que les ventes sont ouvertes renvoie 409 tant que `confirm` n'est pas vrai
// (la base journalise le changement dans audit_log). DELETE ?id= : supprime une session.
export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  const { slug } = await params;
  const p = sessionSchema.safeParse(await req.json().catch(() => null));
  if (!SLUG_RE.test(slug) || !p.success) return Response.json({ error: p.success ? 'Requête invalide.' : p.error.issues[0]?.message ?? 'Requête invalide.' }, { status: 400 });
  const v = p.data;
  const r = await orgRpc<string>('org_session_save', { p_actor: g.s.userId, p_slug: slug, p_id: v.id ?? null, p_venue: v.venue_id, p_label: v.label,
    p_starts: new Date(v.starts_at).toISOString(), p_ends: v.ends_at ? new Date(v.ends_at).toISOString() : null, p_capacity: v.capacity, p_confirm: v.confirm === true });
  if (!r.ok) return Response.json({ error: r.error.message, code: r.error.status === 409 ? 'CONFIRM_DATE_CHANGE' : undefined }, { status: r.error.status });
  revalidatePublicSite();
  return Response.json({ ok: true, id: r.data });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  const { slug } = await params;
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!SLUG_RE.test(slug) || !/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  const r = await orgRpc('org_session_delete', { p_actor: g.s.userId, p_slug: slug, p_id: id });
  if (!r.ok) return Response.json({ error: r.error.message }, { status: r.error.status });
  revalidatePublicSite();
  return Response.json({ ok: true });
}
