import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc, type OrgEventRow } from '@/lib/organizer/data';
import { flyerJpeg } from '@/lib/ticketing/pdf/assets';
import { SLUG_RE } from '@/lib/ticketing/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/organisateur/events/[slug]/flyer — flyer réduit (JPEG) pour les cartes, pour un événement auquel l'utilisateur a accès.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return new Response('Introuvable', { status: 404 });
  const list = await orgRpc<OrgEventRow[]>('org_events', { p_actor: g.s.userId });
  if (!list.ok || !list.data.some((e) => e.slug === slug)) return new Response('Introuvable', { status: 404 });
  const f = await flyerJpeg(slug);
  if (!f) return new Response('Introuvable', { status: 404 });
  return new Response(new Uint8Array(f.data), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=300' } });
}
