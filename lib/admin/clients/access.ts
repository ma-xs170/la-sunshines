// Accès à la page « Clients » : super-admin, ou administrateur à qui le super-admin a accordé clients.lire / clients.modifier.
// Contrôle refait CÔTÉ SERVEUR à chaque page, chaque route API et chaque action (la base le revérifie dans chaque fonction admin_*).
// Un non-autorisé reçoit 404 (jamais une page vide, jamais « Accès refusé » qui confirmerait l'existence de la page).
import 'server-only';
import { notFound } from 'next/navigation';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/roles';
import { adminRpc } from '@/lib/adminSpace';
import { supabaseAdminConfigured } from '@/lib/supabase/admin';
import { supabaseConfigured } from '@/lib/supabase/config';

export interface ClientsAccess { userId: string; email: string; isSuper: boolean; lire: boolean; modifier: boolean }
export type Need = 'lire' | 'modifier' | 'super';

export async function getClientsAccess(need: Need = 'lire'): Promise<ClientsAccess | null> {
  if (!supabaseConfigured() || !supabaseAdminConfigured()) return null;
  const s = await getSession();
  if (!s || s.profile.role !== 'admin' || s.mustChangePassword) return null;
  const r = await adminRpc<{ super: boolean; lire: boolean; modifier: boolean }>('admin_clients_access', { p_user: s.userId });
  if (!r.ok || !r.data.lire) return null;
  if (need === 'modifier' && !r.data.modifier) return null;
  if (need === 'super' && !r.data.super) return null;
  return { userId: s.userId, email: s.email, isSuper: r.data.super, lire: r.data.lire, modifier: r.data.modifier };
}

export async function requireClientsPage(need: Need = 'lire'): Promise<ClientsAccess> {
  const a = await getClientsAccess(need);
  if (!a) notFound();
  return a;
}

export const NO_STORE = { 'Cache-Control': 'no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow' } as const;
export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function requireClientsApi(need: Need = 'lire'): Promise<{ ok: true; a: ClientsAccess } | { ok: false; res: NextResponse }> {
  const a = await getClientsAccess(need);
  return a ? { ok: true, a } : { ok: false, res: json({ error: 'Introuvable.' }, 404) };
}
