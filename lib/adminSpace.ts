// Espace de gestion réservé aux administrateurs du site (Phase 5). Contrôle refait CÔTÉ SERVEUR à chaque page et chaque action :
// compte Supabase de rôle admin ACTIF (le mot de passe historique /admin ne donne aucun accès ici).
import 'server-only';
import { forbidden, redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { getSession, type Session } from '@/lib/auth/roles';
import { createSupabaseAdminClient, supabaseAdminConfigured } from '@/lib/supabase/admin';
import { supabaseConfigured } from '@/lib/supabase/config';

const ERR: Record<string, [number, string]> = {
  FORBIDDEN: [403, 'Accès refusé.'], USER_NOT_FOUND: [404, 'Compte introuvable.'], ORG_NOT_FOUND: [404, 'Organisation introuvable.'], EVENT_NOT_FOUND: [404, 'Évènement introuvable.'],
  DEST_NOT_FOUND: [404, 'Aucune organisation avec cette référence.'], DEST_NOT_APPROVED: [409, 'L’organisation de destination n’est pas approuvée.'], SAME_ORGANIZER: [409, 'L’évènement appartient déjà à cette organisation.'],
  CONFIRMATION_MISMATCH: [400, 'La référence saisie ne correspond pas à l’organisation de destination.'], SELF_FORBIDDEN: [409, 'Tu ne peux pas modifier ton propre accès.'],
  LAST_SUPER: [409, 'Impossible : ce serait le dernier super-administrateur.'], BAD_LEVEL: [400, 'Niveau invalide.'], BAD_STATUS: [400, 'Statut invalide.'], BAD_TRANSITION: [409, 'Transition impossible depuis le statut actuel.'],
  CONFLICT: [409, 'Ce compte a été modifié entre-temps par quelqu’un d’autre. Recharge la fiche avant de réessayer.'], CLIENT_REASON_REQUIRED: [400, 'Un motif (5 caractères minimum) est obligatoire.'], EMAIL_TAKEN: [409, 'Cette adresse e-mail est déjà utilisée par un autre compte.'],
  BAD_EMAIL: [400, 'Adresse e-mail invalide.'], BAD_BIRTH_DATE: [400, 'Date de naissance invalide (jamais dans le futur).'], BAD_NAME: [400, 'Prénom et nom obligatoires (60 caractères maximum).'], BAD_PHONE: [400, 'Numéro de téléphone invalide.'],
  NO_CHANGE: [409, 'Aucune modification à enregistrer.'], ANONYMIZED: [409, 'Ce compte est anonymisé : il ne peut plus être modifié.'], UPCOMING_TICKETS: [409, 'Impossible : ce compte a encore des billets valides pour des évènements à venir.'],
  ADMIN_TARGET: [409, 'Action impossible sur un compte administrateur ou organisateur.'], BAD_PERMISSION: [400, 'Permission inconnue.'], BAD_ACTION: [400, 'Action inconnue.'],
  ORG_NAME_REQUIRED: [400, 'Le nom de la structure est obligatoire.'], BAD_SIRET: [400, 'Le SIRET doit comporter 14 chiffres.'], BAD_FILTER: [400, 'Filtre invalide.'], REQUEST_NOT_FOUND: [404, 'Demande introuvable.'], NOT_PENDING: [409, 'Cette demande a déjà été traitée.'], REASON_REQUIRED: [400, 'Le motif du refus est obligatoire (5 caractères minimum).'], ORG_NOT_APPROVED: [409, 'L’organisation n’est pas approuvée.'], CHECKLIST_INCOMPLETE: [409, 'La checklist de l’évènement n’est plus complète.'],
};
export const adminError = (m?: string): { status: number; message: string } => ({ status: ERR[m ?? '']?.[0] ?? 500, message: ERR[m ?? '']?.[1] ?? 'Erreur inattendue. Réessaie.' });

export async function adminRpc<T>(fn: string, args: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const { data, error } = await createSupabaseAdminClient().rpc(fn, args);
  if (error) { if (!ERR[error.message]) console.error(`[admin] ${fn} :`, error.message); return { ok: false, ...adminError(error.message) }; }
  return { ok: true, data: data as T };
}

/** Pages : redirige vers la connexion / change de mot de passe, ou affiche « Accès refusé » (403) si le compte n'est pas administrateur. */
export async function requireAdminPage(next: string): Promise<Session> {
  if (!supabaseConfigured() || !supabaseAdminConfigured()) redirect('/');
  const s = await getSession();
  if (!s) redirect(`/connexion?next=${encodeURIComponent(next)}`);
  if (s.profile.role !== 'admin') forbidden();
  if (s.mustChangePassword) redirect('/compte/mot-de-passe');
  return s;
}

/** Routes API : 401 / 403, sinon la session admin. */
export async function requireAdminApi(): Promise<{ ok: true; s: Session } | { ok: false; res: NextResponse }> {
  if (!supabaseConfigured() || !supabaseAdminConfigured()) return { ok: false, res: NextResponse.json({ error: 'Indisponible.' }, { status: 503 }) };
  const s = await getSession();
  if (!s) return { ok: false, res: NextResponse.json({ error: 'Connexion requise.' }, { status: 401 }) };
  if (s.profile.role !== 'admin' || s.mustChangePassword) return { ok: false, res: NextResponse.json({ error: 'Accès refusé.' }, { status: 403 }) };
  return { ok: true, s };
}
