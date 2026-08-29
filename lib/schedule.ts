// Helpers programme horaire — purs (client + serveur). Le champ `time` de chaque
// ScheduleEntry reste individuel ; le regroupement par créneau identique est
// calculé ici pour l'affichage (éditeur admin ET timeline publique).

import type { ScheduleEntry } from './store';

/** « 18:00 » / « 18h00 » / « 18h » / « 18:5 » → 1800 (minutes-of-day-ish, triable). */
export function timeKey(t: string): number {
  const m = t.match(/(\d{1,2})\s*[h:]\s*(\d{0,2})/);
  if (!m) return 99_99;
  return Number(m[1]) * 100 + Number(m[2] || 0);
}

/** Normalise un libellé d'heure vers « HH:MM » quand c'est possible, sinon le
 *  laisse tel quel (valeurs legacy « 18h00 », plages « 16h-18h »…). */
export function normalizeTime(t: string): string {
  const m = t.trim().match(/^(\d{1,2})\s*[h:]\s*(\d{0,2})$/);
  if (!m) return t.trim();
  const hh = String(Math.min(23, Number(m[1]))).padStart(2, '0');
  const mm = String(Math.min(59, Number(m[2] || 0))).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Créneaux « HH:MM » de startHour à endHour par pas de stepMin. */
export function timeSlots(startHour = 14, endHour = 23, stepMin = 30): string[] {
  const out: string[] = [];
  for (let mins = startHour * 60; mins <= endHour * 60; mins += stepMin) {
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    out.push(`${hh}:${mm}`);
  }
  return out;
}

/** Devine [startHour, endHour] depuis un libellé libre type « 16h–22h », « 20:00 »… */
export function slotsFromEventTime(raw: string | undefined): string[] {
  const hours = (raw ?? '').match(/\d{1,2}/g)?.map(Number).filter((n) => n >= 0 && n <= 23) ?? [];
  let start = 14;
  let end = 23;
  if (hours.length >= 2) {
    start = Math.min(hours[0], hours[1]);
    end = Math.max(hours[0], hours[1]);
    // une soirée qui « finit » à 2h du matin : borne haute raisonnable
    if (end <= start) end = start + 6;
  } else if (hours.length === 1) {
    start = Math.max(0, hours[0] - 1);
    end = Math.min(23, hours[0] + 6);
  }
  return timeSlots(start, Math.min(23, end + 1), 30);
}

export type ScheduleGroup = { time: string; entries: ScheduleEntry[] };

/** Regroupe les entrées par créneau identique, triées par heure croissante ;
 *  l'ordre interne d'un groupe est préservé (tel que saisi). */
export function groupSchedule(schedule: ScheduleEntry[]): ScheduleGroup[] {
  const kept = schedule.filter((s) => s.time || s.artistName || s.label);
  const map = new Map<string, ScheduleEntry[]>();
  for (const e of kept) {
    const k = e.time || '';
    (map.get(k) ?? map.set(k, []).get(k)!).push(e);
  }
  return [...map.entries()]
    .map(([time, entries]) => ({ time, entries }))
    .sort((a, b) => timeKey(a.time) - timeKey(b.time));
}
