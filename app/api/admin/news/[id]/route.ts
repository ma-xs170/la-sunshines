import { z } from 'zod';
import { requireBilletterieAdmin } from '@/lib/ticketing/guard';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DELETE — supprime une publication (et son état lu / non lu). Admin uniquement, journalisé.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireBilletterieAdmin();
  if (!g.ok) return g.res;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  const { error } = await createSupabaseAdminClient().rpc('news_admin_delete', { p_actor: g.actor, p_id: id });
  if (error) return Response.json({ error: error.message === 'POST_NOT_FOUND' ? 'Publication introuvable.' : 'Suppression impossible.' }, { status: error.message === 'POST_NOT_FOUND' ? 404 : 500 });
  return Response.json({ ok: true });
}
