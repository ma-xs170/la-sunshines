import { z } from 'zod';
import { adminRpc } from '@/lib/adminSpace';
import { json, requireClientsApi } from '@/lib/admin/clients/access';
import type { ClientDetail } from '@/lib/admin/clients/detail';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { originOf } from '@/lib/auth/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Envoie l'e-mail de réinitialisation du mot de passe (même parcours que « mot de passe oublié »). Le mot de passe n'est ni généré ni vu ici.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireClientsApi('modifier'); if (!g.ok) return g.res;
  const { id } = await params; if (!z.uuid().safeParse(id).success) return json({ error: 'Compte introuvable.' }, 404);
  const cur = await adminRpc<ClientDetail>('admin_customer_detail', { p_actor: g.a.userId, p_id: id, p_log: false });
  if (!cur.ok) return json({ error: cur.message }, cur.status);
  if (!cur.data.profile.email) return json({ error: 'Ce compte n’a pas d’adresse e-mail (compte anonymisé).' }, 409);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(cur.data.profile.email, { redirectTo: `${originOf(req)}/auth/confirm` });
  const sent = !error;
  if (error) console.error('[admin-clients/password-reset]', error.message);
  await adminRpc('admin_customer_log', { p_actor: g.a.userId, p_id: id, p_action: 'customer.password_reset', p_meta: { sent } });
  return json({ ok: true, sent });
}
