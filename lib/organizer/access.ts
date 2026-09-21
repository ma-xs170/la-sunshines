// Accès à l'espace organisateur : compte Supabase ADMIN, ou membre d'un organisateur (table organizer_members).
// Le contrôle réel est refait à chaque requête, côté serveur (ici) ET dans les fonctions SQL org_* (qui ne révèlent pas
// l'existence des événements d'un autre organisateur). L'entrée de menu « Organisateur » n'est qu'un affichage.

import 'server-only';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/roles';
import { supabaseConfigured } from '@/lib/supabase/config';
import { supabaseAdminConfigured } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

import { can, type OrgRole as EffectiveRole } from './roles';

export type OrgRole = 'owner' | 'manager' | 'staff';

export interface OrgSession {
  userId: string;
  email: string;
  firstName: string;
  isAdmin: boolean;
  memberships: { organizerId: string; role: OrgRole }[];
}

export const canManage = (s: OrgSession, role?: string | null) => s.isAdmin || can(role, 'manage');
export const canOwn = (s: OrgSession, role?: string | null) => s.isAdmin || can(role, 'owner');
export type { EffectiveRole };

/** Session organisateur, ou null si non connecté. `hasAccess` = admin ou membre. */
export async function getOrgSession(): Promise<(OrgSession & { hasAccess: boolean }) | null> {
  if (!supabaseConfigured() || !supabaseAdminConfigured()) return null;
  const session = await getSession();
  if (!session) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('organizer_members').select('organizer_id, role'); // RLS : ses propres lignes
  const memberships = ((data ?? []) as { organizer_id: string; role: OrgRole }[]).map((m) => ({ organizerId: m.organizer_id, role: m.role }));
  const isAdmin = session.profile.role === 'admin';
  return {
    userId: session.userId,
    email: session.email,
    firstName: session.profile.first_name,
    isAdmin,
    memberships,
    hasAccess: isAdmin || memberships.length > 0,
  };
}

type ApiGuard = { ok: true; s: OrgSession } | { ok: false; res: NextResponse };

/** Garde des routes /api/organisateur/* : 401 non connecté, 403 sans accès organisateur. */
export async function requireOrganizerApi(): Promise<ApiGuard> {
  if (!supabaseConfigured() || !supabaseAdminConfigured()) return { ok: false, res: NextResponse.json({ error: 'Espace organisateur indisponible.' }, { status: 503 }) };
  const s = await getOrgSession();
  if (!s) return { ok: false, res: NextResponse.json({ error: 'Connexion requise.' }, { status: 401 }) };
  if (!s.hasAccess) return { ok: false, res: NextResponse.json({ error: 'Accès refusé.' }, { status: 403 }) };
  return { ok: true, s };
}
