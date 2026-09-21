// Calendrier régional : fonctions PURES (testées). Toutes les dates s'affichent en heure de Guadeloupe (UTC−4, sans changement d'heure).
export const REGIONS = ['france', 'martinique', 'guadeloupe', 'sxm'] as const;
export type Region = (typeof REGIONS)[number];
export const REGION_LABEL: Record<Region, string> = { france: 'France', martinique: 'Martinique', guadeloupe: 'Guadeloupe', sxm: 'SXM' };
export const isRegion = (v: unknown): v is Region => typeof v === 'string' && (REGIONS as readonly string[]).includes(v);

const GP_OFFSET_MS = -4 * 3600 * 1000;
/** Clé de jour AAAA-MM-JJ en heure de Guadeloupe : une soirée qui finit après minuit reste sur SON jour de début. */
export const dayKey = (iso: string): string => new Date(Date.parse(iso) + GP_OFFSET_MS).toISOString().slice(0, 10);

export interface CalEvent { slug: string; status: string; starts_at: string; ends_at: string | null; organizer: string; organizer_id: string; mine: boolean; venue: string; city: string; region: string; venue_id: string; lat: number | null; lng: number | null }
export type Conflict = { key: string; kind: 'venue' | 'region'; slugs: string[] };

/** Conflits (sans rien bloquer) : deux évènements le même soir au MÊME lieu (« venue »), ou le même soir dans la région (« region »). Les évènements annulés ne comptent pas. */
export function findConflicts(events: CalEvent[]): Conflict[] {
  const live = events.filter((e) => e.status !== 'cancelled');
  const byDay = new Map<string, CalEvent[]>();
  for (const e of live) { const k = dayKey(e.starts_at); byDay.set(k, [...(byDay.get(k) ?? []), e]); }
  const out: Conflict[] = [];
  for (const [day, list] of byDay) {
    const slugs = [...new Set(list.map((e) => e.slug))];
    if (slugs.length < 2) continue;
    const byVenue = new Map<string, Set<string>>();
    for (const e of list) byVenue.set(e.venue_id, new Set([...(byVenue.get(e.venue_id) ?? []), e.slug]));
    for (const [v, s] of byVenue) if (s.size > 1) out.push({ key: `${day}|${v}`, kind: 'venue', slugs: [...s] });
    out.push({ key: day, kind: 'region', slugs });
  }
  return out;
}
/** Slugs concernés par un conflit de lieu (le plus grave) ou de région, pour surligner les évènements. */
export function conflictLevels(cs: Conflict[]): Map<string, 'venue' | 'region'> {
  const m = new Map<string, 'venue' | 'region'>();
  for (const c of cs) for (const s of c.slugs) if (c.kind === 'venue' || !m.has(s)) m.set(s, c.kind);
  return m;
}

/** Grille d'un mois : semaines de 7 jours commençant le lundi ; `null` pour les cases hors mois. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month, 1)); const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(Date.UTC(year, month, d)).toISOString().slice(0, 10));
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}
/** Lundi de la semaine contenant `key` (AAAA-MM-JJ) puis les 7 jours. */
export function weekDays(key: string): string[] {
  const d = new Date(key + 'T00:00:00Z'); const back = (d.getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => new Date(d.getTime() + (i - back) * 86400000).toISOString().slice(0, 10));
}
