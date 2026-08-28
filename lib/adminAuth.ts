// Phase 6 — authentification admin minimale.
//
// Mot de passe unique dans la variable d'env ADMIN_PASSWORD. Le cookie ne
// contient pas le mot de passe mais son empreinte SHA-256 : suffisant pour un
// back-office local à un seul utilisateur.

import { cookies } from 'next/headers';
import { createHash } from 'crypto';

export const ADMIN_COOKIE = 'sun_admin';
const MAX_AGE = 60 * 60 * 8; // 8 h

export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length > 0);
}

export function tokenFor(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

export function passwordMatches(candidate: string): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  return Boolean(pw) && candidate === pw;
}

export async function isAuthed(): Promise<boolean> {
  if (!adminConfigured()) return false;
  const jar = await cookies();
  const value = jar.get(ADMIN_COOKIE)?.value;
  return Boolean(value) && value === tokenFor(process.env.ADMIN_PASSWORD as string);
}

export async function grantSession(): Promise<void> {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, tokenFor(process.env.ADMIN_PASSWORD as string), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
}
