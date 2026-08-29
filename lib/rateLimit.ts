// Limitation de débit simple par clé (IP + route), via Vercel KV.
// Sans KV configuré → on n'empêche rien (retourne toujours "ok") : c'est un
// garde-fou anti-spam, pas une sécurité critique.

import { kv } from '@vercel/kv';
import { kvConfigured } from './pageviews';

export async function rateLimit(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<{ ok: boolean; remaining: number }> {
  if (!kvConfigured()) return { ok: true, remaining: max };
  try {
    const k = `rl:${key}`;
    const count = await kv.incr(k);
    if (count === 1) await kv.expire(k, windowSeconds);
    return { ok: count <= max, remaining: Math.max(0, max - count) };
  } catch {
    return { ok: true, remaining: max };
  }
}

/** IP de la requête (best-effort, derrière proxy Vercel). */
export function clientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get('x-real-ip') ||
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}
