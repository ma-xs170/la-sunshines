// Compteur de pages vues — simple et gratuit, via Vercel KV.
//
// Incrémenté dans middleware.ts à chaque vue de page ; lu par le dashboard
// /admin (top des pages sur 7 jours). Sans store KV lié (KV_REST_API_URL /
// KV_REST_API_TOKEN absents), tout est no-op et le dashboard affiche une
// invite de configuration.

import { kv } from '@vercel/kv';

export function kvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10); // AAAA-MM-JJ (UTC)
}

const KEEP_SECONDS = 60 * 60 * 24 * 40; // ~40 jours de rétention

/** +1 vue pour ce chemin, sur la journée courante. Best-effort. */
export async function trackPageview(path: string): Promise<void> {
  if (!kvConfigured()) return;
  try {
    const key = `pv:${dayKey(new Date())}`;
    await kv.hincrby(key, path, 1);
    await kv.expire(key, KEEP_SECONDS);
  } catch {
    /* jamais bloquant */
  }
}

export type TopPage = { path: string; views: number };
export type PageviewSummary = { total: number; days: number; pages: TopPage[] };

/** Agrège les compteurs des `days` derniers jours → total + top pages. */
export async function pageviewSummary(
  days = 7,
  limit = 10,
): Promise<PageviewSummary | null> {
  if (!kvConfigured()) return null;
  try {
    const counts = new Map<string, number>();
    const now = new Date();
    for (let i = 0; i < days; i += 1) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      const h =
        (await kv.hgetall<Record<string, string | number>>(`pv:${dayKey(d)}`)) ??
        {};
      for (const [path, v] of Object.entries(h)) {
        counts.set(path, (counts.get(path) ?? 0) + Number(v));
      }
    }
    const pages = [...counts.entries()]
      .map(([path, views]) => ({ path, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, limit);
    const total = [...counts.values()].reduce((s, v) => s + v, 0);
    return { total, days, pages };
  } catch {
    return null;
  }
}
