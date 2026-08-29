// Session « espace artiste » — DISTINCTE de la session admin (cookie sun_admin).
//
// Un artiste vérifié se connecte via un lien magique (email) ; le clic pose ici
// un cookie `sun_artist` identifiant l'artiste par son slug. La valeur est
// `slug.HMAC(slug)` — non falsifiable sans le secret serveur. Aucune donnée
// sensible : le slug est déjà public.

import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';

export const ARTIST_COOKIE = 'sun_artist';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 jours

function secret(): string {
  return (
    process.env.ARTIST_SESSION_SECRET ||
    process.env.ADMIN_PASSWORD ||
    'dev-insecure-artist-secret'
  );
}

function sign(slug: string): string {
  return createHmac('sha256', secret()).update(slug).digest('hex');
}

function cookieValue(slug: string): string {
  return `${slug}.${sign(slug)}`;
}

/** Slug de l'artiste connecté, ou `null`. */
export async function getArtistSession(): Promise<string | null> {
  const raw = (await cookies()).get(ARTIST_COOKIE)?.value;
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const slug = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = sign(slug);
  if (sig.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return slug;
}

export async function grantArtistSession(slug: string): Promise<void> {
  (await cookies()).set(ARTIST_COOKIE, cookieValue(slug), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function clearArtistSession(): Promise<void> {
  (await cookies()).delete(ARTIST_COOKIE);
}
