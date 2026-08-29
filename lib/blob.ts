// Vercel Blob — stockage PRIVÉ de la pièce d'identité d'une réclamation de page
// artiste. Le document n'est jamais public : il ne sort que via une route /admin
// authentifiée (get + stream), et il est supprimé dès que l'admin a statué.

import { put, del, get } from '@vercel/blob';

export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
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
