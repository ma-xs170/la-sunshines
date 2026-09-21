import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc } from '@/lib/organizer/data';
import { mapDbError } from '@/lib/ticketing/admin';
import { tierSaveSchema } from '@/lib/ticketing/schemas';
import { SLUG_RE } from '@/lib/ticketing/schemas';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { revalidateTicketing } from '@/lib/ticketing/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PUT /api/organisateur/events/[slug]/tiers — crée (sans id) ou modifie un tarif. Owner / manager / admin (revérifié en SQL).
// Règles identiques au back-office : prix 0 € (gratuit) ou ≥ 0,50 €, quantité ≥ vendus + réservations en cours, tarif archivé non modifiable.
export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  const parsed = tierSaveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Requête invalide.' }, { status: 400 });
  const v = parsed.data;
  const { data, error } = await createSupabaseAdminClient().rpc('org_save_tier', {
    p_actor: g.s.userId, p_slug: slug, p_tier_id: v.id ?? null, p_name: v.name, p_description: v.description, p_price_cents: v.price_cents,
    p_quantity_total: v.quantity_total, p_max_per_order: v.max_per_order, p_sales_start: v.sales_start, p_sales_end: v.sales_end,
    p_is_active: v.is_active, p_sort_order: v.sort_order, p_max_per_account: v.max_per_account ?? null,
  });
  if (error) {
    if (error.message === 'EVENT_NOT_FOUND' || error.message === 'FORBIDDEN') return Response.json({ error: error.message === 'FORBIDDEN' ? 'Accès refusé.' : 'Événement introuvable.' }, { status: error.message === 'FORBIDDEN' ? 403 : 404 });
    const f = mapDbError(error);
    return Response.json({ error: f.message }, { status: f.status });
  }
  revalidateTicketing();
  return Response.json({ ok: true, id: data });
}

// GET — tarifs de l'événement (édition).
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  const r = await orgRpc('org_tiers', { p_actor: g.s.userId, p_slug: slug });
  if (!r.ok) return Response.json({ error: r.error.message }, { status: r.error.status });
  return Response.json(r.data);
}
