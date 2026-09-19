import { NextResponse } from 'next/server';
import { fail } from '@/lib/auth/http';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { editionForSlug, requireBilletterieAdmin } from '@/lib/ticketing/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — billets vendus par tarif, chiffre d'affaires net, taux de remplissage, entrées.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await requireBilletterieAdmin();
  if (!guard.ok) return guard.res;
  const { slug } = await params;
  if (!editionForSlug(slug)) return fail('Événement introuvable.', 404);
  const { data, error } = await createSupabaseAdminClient().rpc('admin_event_stats', { p_actor: guard.actor, p_slug: slug });
  if (error) return fail(error.message === 'EVENT_NOT_FOUND' ? 'Aucune billetterie configurée pour cet événement.' : 'Statistiques indisponibles.', error.message === 'EVENT_NOT_FOUND' ? 404 : 500);
  return NextResponse.json(data);
}
