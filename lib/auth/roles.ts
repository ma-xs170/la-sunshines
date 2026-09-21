// Identité et rôles côté serveur. Source de vérité = supabase.auth.getUser()
// (jeton validé par le serveur Auth) + table profiles (lue sous RLS).
//
// Le mot de passe admin historique (cookie sun_admin) NE donne AUCUN rôle ici :
// les actions de billetterie exigent un compte Supabase avec le bon rôle.

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/config';
import { createSupabaseAdminClient, supabaseAdminConfigured } from '@/lib/supabase/admin';

export type Role = 'customer' | 'staff' | 'admin';

export interface Profile {
  first_name: string;
  last_name: string;
  phone: string;
  role: Role;
}

export interface Session {
  userId: string;
  email: string;
  profile: Profile;
  /** Admin dont le mot de passe provisoire n'a pas encore été changé : accès bloqué jusqu'au changement. */
  mustChangePassword: boolean;
}

/** Session courante (ou null). À appeler côté serveur uniquement. */
export async function getSession(): Promise<Session | null> {
  if (!supabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name, phone, role')
    .eq('id', user.id)
    .maybeSingle();

  const p = (profile as Profile | null) ?? { first_name: '', last_name: '', phone: '', role: 'customer' as Role };
  let mustChangePassword = false;
  if (p.role === 'admin' && supabaseAdminConfigured()) {
    const st = await createSupabaseAdminClient().rpc('admin_account_state', { p_user: user.id });
    mustChangePassword = (st.data as { must_change_password?: boolean } | null)?.must_change_password === true;
  }
  return { userId: user.id, email: user.email ?? '', profile: p, mustChangePassword };
}

/** Hiérarchie : admin ⊃ staff ⊃ customer. */
export function hasRole(role: Role, needed: Role): boolean {
  const rank: Record<Role, number> = { customer: 0, staff: 1, admin: 2 };
  return rank[role] >= rank[needed];
}

type ApiGuard =
  | { ok: true; session: Session }
  | { ok: false; res: NextResponse };

/** Garde pour les routes API : 401 si non connecté, 403 si rôle insuffisant. */
export async function requireApiRole(needed: Role = 'customer'): Promise<ApiGuard> {
  if (!supabaseConfigured()) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'Comptes indisponibles.' }, { status: 503 }),
    };
  }
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'Connexion requise.' }, { status: 401 }),
    };
  }
  if (session.mustChangePassword && needed !== 'customer') {
    return { ok: false, res: NextResponse.json({ error: 'Change ton mot de passe provisoire avant de continuer.', code: 'PASSWORD_CHANGE_REQUIRED' }, { status: 403 }) };
  }
  if (!hasRole(session.profile.role, needed)) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'Accès refusé.' }, { status: 403 }),
    };
  }
  return { ok: true, session };
}
