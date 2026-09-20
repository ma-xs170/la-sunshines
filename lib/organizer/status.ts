// Statut affiché d'un événement dans l'espace organisateur + pourcentages de progression. Fonctions PURES (testées).

export type EventState = 'draft' | 'on_sale' | 'sold_out' | 'ended' | 'cancelled';

export const STATE_LABEL: Record<EventState, string> = {
  draft: 'Brouillon',
  on_sale: 'En vente',
  sold_out: 'Complet',
  ended: 'Terminé',
  cancelled: 'Annulé',
};

export interface StateInput {
  status: string;
  ticketing_enabled: boolean;
  starts_at: string;
  capacity: number;
  sold: number;
  reserved: number;
}

const ENDED_AFTER_MS = 12 * 3600 * 1000; // un événement reste « à venir » jusqu'à 12 h après son début

export function eventState(e: StateInput, now = Date.now()): EventState {
  if (e.status === 'cancelled') return 'cancelled';
  if (e.status === 'closed' || Date.parse(e.starts_at) + ENDED_AFTER_MS < now) return 'ended';
  if (e.status === 'draft' || !e.ticketing_enabled) return 'draft';
  if (e.sold + e.reserved >= e.capacity) return 'sold_out';
  return 'on_sale';
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** Parts de la barre de progression : vendus, puis réservations en cours (teinte atténuée). Arrondies sans dépasser 100 %. */
export function progress(sold: number, reserved: number, capacity: number): { soldPct: number; reservedPct: number; totalPct: number } {
  if (capacity <= 0) return { soldPct: 0, reservedPct: 0, totalPct: 0 };
  const soldPct = clamp((sold / capacity) * 100);
  const reservedPct = clamp(Math.min((reserved / capacity) * 100, 100 - soldPct));
  return { soldPct, reservedPct, totalPct: Math.round(soldPct) };
}
