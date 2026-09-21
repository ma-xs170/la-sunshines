import 'server-only';
import { getSession } from '@/lib/auth/roles';
import { createSupabaseAdminClient, supabaseAdminConfigured } from '@/lib/supabase/admin';
import { supabaseConfigured } from '@/lib/supabase/config';

export interface AdminShellData { userId: string; firstName: string; reference: string | null; isSuper: boolean; pending: number; support: number; publications: number }

/** Données du cadre admin, ou null si la personne n'est pas un compte admin actif (login mot de passe historique, staff, visiteur : pas de cadre). */
export async function getAdminShellData(): Promise<AdminShellData | null> {
  if (!supabaseConfigured() || !supabaseAdminConfigured()) return null;
  const s = await getSession();
  if (!s || s.profile.role !== 'admin' || s.mustChangePassword) return null;
  const db = createSupabaseAdminClient();
  const [acc, prof, pend, sup, pub] = await Promise.all([
    db.from('admin_accounts').select('level, active').eq('user_id', s.userId).maybeSingle(),
    db.from('profiles').select('admin_reference').eq('id', s.userId).maybeSingle(),
    db.from('organizers').select('id', { count: 'exact', head: true }).eq('account_status', 'pending'),
    db.from('support_threads').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    db.from('publication_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  if (acc.data && acc.data.active === false) return null;
  return { userId: s.userId, firstName: s.profile.first_name, reference: (prof.data?.admin_reference as string | null) ?? null, isSuper: acc.data?.level === 'super', pending: pend.count ?? 0, support: sup.count ?? 0, publications: pub.count ?? 0 };
}
