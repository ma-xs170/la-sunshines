// Données PRIVÉES des artistes / abonnés — stockées dans Supabase (tables RLS, service_role uniquement), jamais dans
// data/content.json (fichier versionné dans un dépôt GitHub public). SERVEUR UNIQUEMENT.
//
// Sans Supabase configuré, ces fonctionnalités sont indisponibles (on renvoie null / false / []) : mieux vaut
// refuser que retomber sur le dépôt public.

import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { createSupabaseAdminClient, supabaseAdminConfigured } from './supabase/admin';

export const LOGIN_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 min

export function privateStorageConfigured(): boolean {
  return supabaseAdminConfigured();
}
const db = () => createSupabaseAdminClient();
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const rndToken = (bytes: number) => randomBytes(bytes).toString('base64url');

// ------------------------------------------------------------------ emails d'artistes
/** Emails de connexion des artistes, par slug. */
export async function getArtistEmails(): Promise<Record<string, string>> {
  if (!privateStorageConfigured()) return {};
  const { data, error } = await db().from('artist_emails').select('artist_slug, email');
  if (error) { console.error('[private] emails artistes :', error.message); return {}; }
  return Object.fromEntries((data ?? []).map((r) => [r.artist_slug as string, r.email as string]));
}

export async function getArtistEmail(slug: string): Promise<string> {
  if (!privateStorageConfigured()) return '';
  const { data } = await db().from('artist_emails').select('email').eq('artist_slug', slug).maybeSingle();
  return (data?.email as string | undefined) ?? '';
}

/** Enregistre (ou efface si vide) l'email d'un artiste. Renvoie false si le stockage est indisponible. */
export async function setArtistEmail(slug: string, email: string): Promise<boolean> {
  if (!privateStorageConfigured()) return false;
  const e = email.trim().toLowerCase();
  const q = e
    ? await db().from('artist_emails').upsert({ artist_slug: slug, email: e, updated_at: new Date().toISOString() })
    : await db().from('artist_emails').delete().eq('artist_slug', slug);
  if (q.error) { console.error('[private] écriture email artiste :', q.error.message); return false; }
  return true;
}

// ------------------------------------------------------------------ abonnements
export interface SubscriptionRow { artistSlug: string; email: string; token: string }

/** Ajoute un abonnement. `already` = déjà abonné (rien changé). null = stockage indisponible / erreur. */
export async function addSubscription(artistSlug: string, email: string): Promise<{ token: string; already: boolean } | null> {
  if (!privateStorageConfigured()) return null;
  const e = email.trim().toLowerCase();
  const found = await db().from('artist_subscriptions').select('token').eq('artist_slug', artistSlug).eq('email', e).maybeSingle();
  if (found.error) { console.error('[private] abonnement :', found.error.message); return null; }
  if (found.data) return { token: found.data.token as string, already: true };
  const token = rndToken(24);
  const ins = await db().from('artist_subscriptions').insert({ artist_slug: artistSlug, email: e, token });
  if (ins.error) { console.error('[private] abonnement :', ins.error.message); return null; }
  return { token, already: false };
}

/** Supprime l'abonnement correspondant au jeton du lien. true = supprimé ; false = inconnu ; null = indisponible. */
export async function removeSubscriptionByToken(token: string): Promise<boolean | null> {
  if (!privateStorageConfigured()) return null;
  const { data, error } = await db().from('artist_subscriptions').delete().eq('token', token).select('id');
  if (error) { console.error('[private] désabonnement :', error.message); return null; }
  return (data?.length ?? 0) > 0;
}

export async function listSubscribers(artistSlugs: string[]): Promise<SubscriptionRow[]> {
  if (!privateStorageConfigured() || artistSlugs.length === 0) return [];
  const { data, error } = await db().from('artist_subscriptions').select('artist_slug, email, token').in('artist_slug', artistSlugs);
  if (error) { console.error('[private] abonnés :', error.message); return []; }
  return (data ?? []).map((r) => ({ artistSlug: r.artist_slug as string, email: r.email as string, token: r.token as string }));
}

export async function getNotifiedEmails(eventSlug: string): Promise<Set<string>> {
  if (!privateStorageConfigured()) return new Set();
  const { data } = await db().from('artist_notifications').select('email').eq('event_slug', eventSlug);
  return new Set((data ?? []).map((r) => r.email as string));
}

export async function markNotified(eventSlug: string, emails: string[]): Promise<void> {
  if (!privateStorageConfigured() || emails.length === 0) return;
  const rows = emails.map((email) => ({ event_slug: eventSlug, email: email.toLowerCase() }));
  const { error } = await db().from('artist_notifications').upsert(rows, { onConflict: 'event_slug,email', ignoreDuplicates: true });
  if (error) console.error('[private] marquage notifié :', error.message);
}

// ------------------------------------------------------------------ liens de connexion artiste
/** Crée un lien (jeton en clair renvoyé UNE fois ; seul son hash est stocké). Invalide les jetons non utilisés de l'artiste. */
export async function issueArtistLoginToken(slug: string): Promise<string | null> {
  if (!privateStorageConfigured()) return null;
  const c = db();
  await c.from('artist_login_tokens').delete().eq('artist_slug', slug).eq('used', false);
  await c.from('artist_login_tokens').delete().lt('expires_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  const token = rndToken(32);
  const { error } = await c.from('artist_login_tokens').insert({
    token_hash: sha256(token), artist_slug: slug, expires_at: new Date(Date.now() + LOGIN_TOKEN_TTL_MS).toISOString(),
  });
  if (error) { console.error('[private] jeton de connexion :', error.message); return null; }
  return token;
}

/** Consomme un jeton valide (usage unique, atomique) et renvoie le slug de l'artiste, sinon null. */
export async function consumeArtistLoginToken(token: string): Promise<string | null> {
  if (!privateStorageConfigured() || !token) return null;
  const { data, error } = await db().from('artist_login_tokens')
    .update({ used: true })
    .eq('token_hash', sha256(token)).eq('used', false).gt('expires_at', new Date().toISOString())
    .select('artist_slug');
  if (error || !data || data.length !== 1) return null;
  return data[0].artist_slug as string;
}

// ------------------------------------------------------------------ demandes de vérification
export interface VerificationRow {
  id: string; artistSlug: string; name: string; email: string; blobUrl: string; blobPathname: string; fileType: string; createdAt: string;
}
type VRow = { id: string; artist_slug: string; name: string; email: string; blob_url: string; blob_pathname: string; file_type: string; created_at: string };
const toV = (r: VRow): VerificationRow => ({
  id: r.id, artistSlug: r.artist_slug, name: r.name, email: r.email, blobUrl: r.blob_url, blobPathname: r.blob_pathname, fileType: r.file_type, createdAt: r.created_at,
});

export async function listVerifications(): Promise<VerificationRow[]> {
  if (!privateStorageConfigured()) return [];
  const { data, error } = await db().from('artist_verifications').select('*').order('created_at', { ascending: false });
  if (error) { console.error('[private] vérifications :', error.message); return []; }
  return ((data ?? []) as VRow[]).map(toV);
}
export async function getVerification(id: string): Promise<VerificationRow | null> {
  if (!privateStorageConfigured()) return null;
  const { data } = await db().from('artist_verifications').select('*').eq('id', id).maybeSingle();
  return data ? toV(data as VRow) : null;
}
export async function hasVerificationFor(slug: string): Promise<boolean> {
  if (!privateStorageConfigured()) return false;
  const { data } = await db().from('artist_verifications').select('id').eq('artist_slug', slug).maybeSingle();
  return Boolean(data);
}
export async function createVerification(v: Omit<VerificationRow, 'id' | 'createdAt'>): Promise<VerificationRow | null> {
  if (!privateStorageConfigured()) return null;
  const { data, error } = await db().from('artist_verifications')
    .insert({ artist_slug: v.artistSlug, name: v.name, email: v.email, blob_url: v.blobUrl, blob_pathname: v.blobPathname, file_type: v.fileType })
    .select().single();
  if (error || !data) { console.error('[private] création vérification :', error?.message); return null; }
  return toV(data as VRow);
}
export async function deleteVerification(id: string): Promise<void> {
  if (!privateStorageConfigured()) return;
  await db().from('artist_verifications').delete().eq('id', id);
}
