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
  const n = Number(input.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/** Frais de service acheteur : même formule que reserve_tickets (SQL). */
export function computeFee(subtotalCents: number, percent: number, fixedCents: number): number {
  if (subtotalCents <= 0) return 0;
  return Math.round((subtotalCents * percent) / 100) + fixedCents;
}
