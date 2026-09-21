import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc, type OrgStats } from '@/lib/organizer/data';
import { SLUG_RE } from '@/lib/ticketing/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/organisateur/events/[slug]/live — compteurs seuls (ventes, stock, entrées), sans donnée personnelle.
// Interrogé toutes les 2 s par le tableau de bord ; le contrôle d'appartenance est refait en SQL (org_event_stats).
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  const r = await orgRpc<OrgStats>('org_event_stats', { p_actor: g.s.userId, p_slug: slug });
  if (!r.ok) return Response.json({ error: 'Introuvable.' }, { status: 404 });   // même réponse : on ne révèle pas l'existence d'un autre organisateur
  const s = r.data;
  return Response.json(
    { sold: s.sold, reserved: s.reserved, remaining: s.remaining, entered: s.entered, revenue_cents: s.revenue_cents, refunded_cents: s.refunded_cents,
      tiers: s.tiers.map((t) => [t.tier_id, t.sold, t.reserved]) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
