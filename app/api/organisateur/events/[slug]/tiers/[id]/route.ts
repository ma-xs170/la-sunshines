import { z } from 'zod';
import { requireOrganizerApi } from '@/lib/organizer/access';
import { mapDbError } from '@/lib/ticketing/admin';
import { SLUG_RE } from '@/lib/ticketing/schemas';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { revalidateTicketing } from '@/lib/ticketing/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DELETE /api/organisateur/events/[slug]/tiers/[id] — supprime un tarif jamais vendu ; sinon l'ARCHIVE (réponse : deleted | archived).
export async function DELETE(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  const { slug, id } = await params;
  if (!SLUG_RE.test(slug) || !z.uuid().safeParse(id).success) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  const { data, error } = await createSupabaseAdminClient().rpc('org_remove_tier', { p_actor: g.s.userId, p_slug: slug, p_tier_id: id });
  if (error) {
    if (error.message === 'FORBIDDEN') return Response.json({ error: 'Accès refusé.' }, { status: 403 });
    const f = mapDbError(error);
    return Response.json({ error: f.message }, { status: f.status });
  }
  revalidateTicketing();
  return Response.json({ ok: true, result: data });
}
