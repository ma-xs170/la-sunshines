import 'server-only';
import { NextResponse } from 'next/server';
import { getSession, type Session } from '@/lib/auth/roles';
import { createSupabaseAdminClient, supabaseAdminConfigured } from '@/lib/supabase/admin';
import { supabaseConfigured } from '@/lib/supabase/config';

const ERR: Record<string, [number, string]> = {
  FORBIDDEN: [403, 'Accès refusé.'], THREAD_NOT_FOUND: [404, 'Ticket introuvable.'], CLOSED: [409, 'Ce ticket est fermé : il est en lecture seule.'], EMPTY_MESSAGE: [400, 'Écris un message.'],
  BAD_REFERENCE: [400, 'Référence invalide : saisis la référence ORG.XXXXXXXX d’une organisation approuvée.'], ALREADY_ADDED: [409, 'Cette organisation participe déjà à la discussion.'],
  ALREADY_CLAIMED: [409, 'Ce ticket vient d’être pris en charge par un autre administrateur.'], RATE_LIMIT: [429, 'Trop de tickets créés récemment. Réessaie plus tard.'], BAD_PRIORITY: [400, 'Priorité invalide.'],
  USER_NOT_FOUND: [404, 'Administrateur introuvable.'], BAD_FILTER: [400, 'Filtre invalide.'],
};
export async function supportRpc<T>(fn: string, args: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const { data, error } = await createSupabaseAdminClient().rpc(fn, args);
  if (error) { const e = ERR[error.message]; if (!e) console.error(`[support] ${fn} :`, error.message); return { ok: false, status: e?.[0] ?? 500, message: e?.[1] ?? 'Erreur inattendue. Réessaie.' }; }
  return { ok: true, data: data as T };
}
/** Session connectée (organisateur ou admin) : les droits fins sont revérifiés dans les fonctions SQL support_*. */
export async function requireSupportSession(): Promise<{ ok: true; s: Session } | { ok: false; res: NextResponse }> {
  if (!supabaseConfigured() || !supabaseAdminConfigured()) return { ok: false, res: NextResponse.json({ error: 'Support indisponible.' }, { status: 503 }) };
  const s = await getSession();
  if (!s) return { ok: false, res: NextResponse.json({ error: 'Connexion requise.' }, { status: 401 }) };
  if (s.mustChangePassword) return { ok: false, res: NextResponse.json({ error: 'Change ton mot de passe provisoire avant de continuer.' }, { status: 403 }) };
  return { ok: true, s };
}
