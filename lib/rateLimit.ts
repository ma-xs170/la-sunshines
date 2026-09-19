// Limitation de débit simple par clé (IP + route), via Vercel KV.
// Par défaut, sans KV configuré → on n'empêche rien (retourne toujours "ok") :
// garde-fou anti-spam. Option failClosed pour les endpoints sensibles.

import { kv } from '@vercel/kv';
import { kvConfigured } from './pageviews';

export async function rateLimit(
  key: string,
  max: number,
  windowSeconds: number,
  opts?: { failClosed?: boolean },
): Promise<{ ok: boolean; remaining: number }> {
  // failClosed : pour les endpoints sensibles (inscription, mot de passe oublié).
  // En PRODUCTION, sans KV (ou si KV tombe) on refuse plutôt que de laisser
  // l'endpoint sans protection. En dev local, sans KV, on laisse passer.
  const closed = opts?.failClosed === true && process.env.NODE_ENV === 'production';
  if (!kvConfigured()) return { ok: !closed, remaining: closed ? 0 : max };
  try {
    const k = `rl:${key}`;
    const count = await kv.incr(k);
    if (count === 1) await kv.expire(k, windowSeconds);
    return { ok: count <= max, remaining: Math.max(0, max - count) };
  } catch {
    return { ok: !closed, remaining: closed ? 0 : max };
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
