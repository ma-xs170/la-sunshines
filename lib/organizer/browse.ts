// Recherche, puces de statut, onglets et filtres de la liste d'événements. Fonctions PURES (testées), partagées serveur / client.
import type { EventState } from './status';

export interface CardEvent {
  slug: string; title: string; startsAt: string; dateLabel: string; venue: string;
  state: EventState; archived: boolean;
  sold: number; reserved: number; capacity: number; entered: number;
  /** null pour le staff : les revenus ne lui sont pas communiqués. */
  revenueCents: number | null;
  hasFlyer: boolean; organizerName: string;
}

export type Tab = 'upcoming' | 'past' | 'archives';
export type Chip = 'all' | 'on_sale' | 'draft' | 'ended';
export const TAB_LABEL: Record<Tab, string> = { upcoming: 'À venir', past: 'Passés', archives: 'Archives' };
export const CHIP_LABEL: Record<Chip, string> = { all: 'Tous', on_sale: 'En vente', draft: 'Brouillon', ended: 'Terminé' };

export interface Filters { q: string; chip: Chip; tab: Tab; venue: string; from: string; to: string }
export const NO_FILTERS: Filters = { q: '', chip: 'all', tab: 'upcoming', venue: '', from: '', to: '' };

export function tabOf(e: Pick<CardEvent, 'archived' | 'state'>): Tab {
  if (e.archived) return 'archives';
  return e.state === 'ended' || e.state === 'cancelled' ? 'past' : 'upcoming';
}

/** « Complet » compte comme « en vente » pour la puce (l'événement est publié) ; « Annulé » n'a pas de puce propre. */
export function matchesChip(state: EventState, chip: Chip): boolean {
  if (chip === 'all') return true;
  if (chip === 'on_sale') return state === 'on_sale' || state === 'sold_out';
  return state === (chip as EventState);
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const DAY_MS = 86400_000;

/** Applique recherche + puce + onglet + filtres (lieu, période). `from`/`to` : « AAAA-MM-JJ », bornes incluses (heure de Guadeloupe, UTC−4). */
export function filterEvents(events: CardEvent[], f: Filters): CardEvent[] {
  const q = fold(f.q.trim());
  const from = /^\d{4}-\d{2}-\d{2}$/.test(f.from) ? Date.parse(`${f.from}T00:00:00-04:00`) : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(f.to) ? Date.parse(`${f.to}T00:00:00-04:00`) + DAY_MS : null;
  return events.filter((e) => {
    if (tabOf(e) !== f.tab) return false;
    if (!matchesChip(e.state, f.chip)) return false;
    if (f.venue && e.venue !== f.venue) return false;
    const t = Date.parse(e.startsAt);
    if (from !== null && t < from) return false;
    if (to !== null && t >= to) return false;
    if (q && !fold(`${e.title} ${e.venue} ${e.organizerName}`).includes(q)) return false;
    return true;
  });
}

/** Nombre d'événements par onglet, hors filtres de puce / recherche (pour les compteurs). */
export function tabCounts(events: CardEvent[]): Record<Tab, number> {
  const c: Record<Tab, number> = { upcoming: 0, past: 0, archives: 0 };
  for (const e of events) c[tabOf(e)]++;
  return c;
}

/** Nombre de filtres avancés actifs (lieu, dates) : pour le badge du bouton « Filtres ». */
export const activeFilterCount = (f: Filters): number => [f.venue, f.from, f.to].filter(Boolean).length;

