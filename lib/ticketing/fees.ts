// Frais de service : règles PURES (testées). La base reste l'autorité (reserve_tickets / apply_promo recalculent avec les paramètres reçus).
export type FeeMode = 'customer' | 'included';
export interface FeeConfig { mode: FeeMode; min_order_cents: number; percent: number | null; fixed: number | null }
export interface FeeRates { percent: number; fixedCents: number; source: 'event' | 'organizer' | 'global' }

/** Taux effectifs : surcharge de l'évènement > surcharge de l'organisateur (déjà fusionnées côté SQL) > réglage global. */
export function effectiveRates(cfg: Pick<FeeConfig, 'percent' | 'fixed'> | null, global: { feePercent: number; feeFixedCents: number }): FeeRates {
  const percent = cfg?.percent ?? null, fixed = cfg?.fixed ?? null;
  if (percent === null && fixed === null) return { percent: global.feePercent, fixedCents: global.feeFixedCents, source: 'global' };
  return { percent: percent ?? global.feePercent, fixedCents: fixed ?? global.feeFixedCents, source: 'event' };
}

/** Frais pour un sous-total : aucun sur une commande gratuite. Même formule que la base (arrondi au centime). */
export function computeFee(subtotalCents: number, r: { percent: number; fixedCents: number }): number {
  return subtotalCents <= 0 ? 0 : Math.round((subtotalCents * r.percent) / 100) + r.fixedCents;
}

export interface FeePreview { customerPays: number; fee: number; organizerReceives: number }
/** Ce que paie le client et ce que reçoit l'organisateur pour un billet au prix affiché. */
export function feePreview(priceCents: number, r: { percent: number; fixedCents: number }, mode: FeeMode): FeePreview {
  const fee = computeFee(priceCents, r);
  return mode === 'included' ? { customerPays: priceCents, fee, organizerReceives: Math.max(priceCents - fee, 0) } : { customerPays: priceCents + fee, fee, organizerReceives: priceCents };
}
