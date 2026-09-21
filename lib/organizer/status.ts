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

// ---- Jauge d'un tarif ----
export type TierStatus = 'on_sale' | 'sold_out' | 'closed' | 'upcoming';
export const TIER_STATUS_LABEL: Record<TierStatus, string> = { on_sale: 'En vente', sold_out: 'Épuisé', closed: 'Fermé', upcoming: 'À venir' };
export type TierAlert = 'ok' | 'low' | 'out';

export interface TierGaugeInput {
  quantity_total: number; sold: number; reserved: number;
  archived?: boolean; is_active?: boolean; sales_start?: string | null; sales_end?: string | null;
}

/** Statut d'un tarif : fermé (archivé, en pause ou vente terminée) > à venir > épuisé > en vente. */
export function tierStatus(t: TierGaugeInput, now = Date.now()): TierStatus {
  if (t.archived || t.is_active === false || (t.sales_end && Date.parse(t.sales_end) <= now)) return 'closed';
  if (t.sales_start && Date.parse(t.sales_start) > now) return 'upcoming';
  if (t.sold + t.reserved >= t.quantity_total) return 'sold_out';
  return 'on_sale';
}

/** Niveau d'alerte du stock : « out » quand il n'en reste plus, « low » à 15 % restants ou moins (et au plus 10 places pour les gros stocks). */
export function tierAlert(t: TierGaugeInput): TierAlert {
  const left = Math.max(t.quantity_total - t.sold - t.reserved, 0);
  if (t.quantity_total > 0 && left === 0) return 'out';
  if (t.quantity_total > 0 && (left / t.quantity_total <= 0.15 || left <= Math.min(10, Math.ceil(t.quantity_total * 0.3)))) return 'low';
  return 'ok';
}
