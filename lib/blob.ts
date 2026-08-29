// Vercel Blob — stockage PRIVÉ de la pièce d'identité d'une réclamation de page
// artiste. Le document n'est jamais public : il ne sort que via une route /admin
// authentifiée (get + stream), et il est supprimé dès que l'admin a statué.

import { put, del, get } from '@vercel/blob';

/**
 * Vercel Blob est-il utilisable ?
 *
 * Deux modes d'authentification, tous deux gérés automatiquement par le SDK
 * (`put` / `del` / `get` n'ont JAMAIS besoin qu'on leur passe un token) :
 *
 *  1. `BLOB_READ_WRITE_TOKEN` — jeton statique. Injecté si on choisit « exposer
 *     le token » à la connexion du store, ou renseigné à la main en local.
 *  2. **OIDC natif** — quand le store Blob est relié au projet sans jeton statique
 *     (option par défaut aujourd'hui), Vercel injecte à l'exécution un jeton OIDC
 *     temporaire (`VERCEL_OIDC_TOKEN`, ou l'en-tête `x-vercel-oidc-token`) + le
 *     `BLOB_STORE_ID`. `@vercel/blob` (>= 2.x) s'authentifie seul avec ça.
 *
 * On considère donc le Blob disponible dès qu'un de ces signaux est présent — ou
 * simplement qu'on tourne sur Vercel (`VERCEL === '1'`), où l'auth OIDC prendra le
 * relais. Un vrai échec de credentials est de toute façon rattrapé proprement par
 * les routes appelantes (503 / 502), jamais un crash.
 */
export function blobConfigured(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
      process.env.BLOB_STORE_ID ||
      process.env.VERCEL_OIDC_TOKEN ||
      process.env.VERCEL === '1',
  );
}

const MAX_BYTES = 10 * 1024 * 1024; // 10 Mo
const OK_TYPES = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/i;

export function isAllowedDoc(type: string, size: number): boolean {
  return OK_TYPES.test(type) && size > 0 && size <= MAX_BYTES;
}

export async function uploadVerificationDoc(
  file: File,
  artistSlug: string,
): Promise<{ url: string; pathname: string; fileType: string }> {
  const ext =
    file.type === 'application/pdf'
      ? 'pdf'
      : file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'bin';
  const res = await put(`verification/${artistSlug}.${ext}`, file, {
    access: 'private',
    addRandomSuffix: true,
    contentType: file.type || 'application/octet-stream',
  });
  return { url: res.url, pathname: res.pathname, fileType: file.type };
}

export async function deleteBlob(pathnameOrUrl: string): Promise<void> {
  try {
    await del(pathnameOrUrl);
  } catch (e) {
    console.error('[blob] suppression échouée :', e);
  }
}

/** Flux + type d'un blob privé — pour le proxy /admin. `null` si introuvable. */
export async function getBlob(
  pathname: string,
): Promise<{ stream: ReadableStream; contentType: string } | null> {
  const res = await get(pathname, { access: 'private' });
  if (!res || !res.stream) return null;
  return {
    stream: res.stream,
    contentType: res.blob.contentType || 'application/octet-stream',
  };
}
