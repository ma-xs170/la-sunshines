// Analyse : périodes proposées et calculs d'affichage. Fonctions PURES (testées).
export const PERIODS = { '7': 'Semaine', '30': '30 jours', '90': '3 mois', all: 'Tout' } as const;
export type Period = keyof typeof PERIODS;

/** Période demandée dans l'URL → valeur sûre (30 jours par défaut) et nombre de jours pour la base (null = depuis toujours). */
export function parsePeriod(v: string | undefined): { key: Period; days: number | null } {
  const key = (v && v in PERIODS ? v : '30') as Period;
  return { key, days: key === 'all' ? null : Number(key) };
}

/** Taux de remplissage en % (0 si capacité nulle), plafonné à 100. */
export const fillPct = (sold: number, capacity: number): number => (capacity > 0 ? Math.min(100, Math.round((sold / capacity) * 100)) : 0);

/** Panier moyen en centimes par billet (0 sans vente). */
export const avgTicketCents = (revenueCents: number, sold: number): number => (sold > 0 ? Math.round(revenueCents / sold) : 0);

export interface AnalyticsData {
  days: number | null;
  totals: { sold: number; revenue_cents: number; refunded_cents: number; entered: number };
  events: { slug: string; starts_at: string; capacity: number; status: string; sold_total: number; sold: number; entered: number; revenue_cents: number }[];
  tiers: { name: string; sold: number; revenue_cents: number }[];
  series: { day: string; sold: number; revenue_cents: number }[];
}
export interface PaymentsData {
  events: { slug: string; starts_at: string; orders: number; gross_cents: number; refunded_cents: number; fees_cents: number }[];
}
