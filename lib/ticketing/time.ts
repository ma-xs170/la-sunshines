// Fuseau de la billetterie : Guadeloupe (America/Guadeloupe = UTC−4, pas d'heure
// d'été). Les dates sont stockées en timestamptz ; l'admin les saisit et les lit
// en heure locale de Guadeloupe, quel que soit le fuseau de son navigateur.

export const TICKETING_TZ = 'America/Guadeloupe';
const OFFSET = '-04:00';
const OFFSET_MS = 4 * 60 * 60 * 1000;

/** '2026-10-17T18:00' (heure de Guadeloupe) → ISO avec offset, ou null si vide/invalide. */
export function gpLocalToIso(local: string | null | undefined): string | null {
  const v = (local ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const iso = `${v}:00${OFFSET}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/** ISO (ou timestamptz Postgres) → '2026-10-17T18:00' en heure de Guadeloupe (champ datetime-local). */
export function isoToGpLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t - OFFSET_MS).toISOString().slice(0, 16);
}

/** Affichage lisible en français, heure de Guadeloupe. */
export function formatGp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: TICKETING_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(t));
}

/** Montant en centimes → « 12,50 € ». */
export function formatEuro(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

/** « 12,5 » / « 12.50 » → 1250 ; NaN si invalide. */
export function euroToCents(input: string): number {
  const clean = input.replace(/\s/g, '').replace(',', '.');
  if (clean === '') return NaN; // champ vide ≠ 0 € : un tarif gratuit se saisit « 0 »
  const n = Number(clean);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/** Frais de service acheteur : même formule que reserve_tickets (SQL). */
export function computeFee(subtotalCents: number, percent: number, fixedCents: number): number {
  if (subtotalCents <= 0) return 0;
  return Math.round((subtotalCents * percent) / 100) + fixedCents;
}

/** Montant en centimes → « Gratuit » pour 0, sinon « 12,50 € » (prix d'un tarif, total d'une commande). */
export function formatPrice(cents: number): string {
  return cents === 0 ? 'Gratuit' : formatEuro(cents);
}

/** Prix saisi (centimes) valable pour un tarif : 0 (gratuit) ou ≥ 0,50 € (minimum Stripe). Renvoie un message ou null. */
export function priceError(cents: number): string | null {
  if (!Number.isFinite(cents)) return 'Indique un prix.';
  if (cents < 0) return 'Le prix ne peut pas être négatif.';
  if (cents > 0 && cents < 50) return 'Un prix entre 0,01 € et 0,49 € est refusé : Stripe ne peut pas l’encaisser. Mets 0 pour un tarif gratuit, ou au moins 0,50 €.';
  return null;
}

/** Commande / panier gratuit : rien à payer, donc jamais de session Stripe. */
export const isFree = (totalCents: number): boolean => totalCents === 0;
