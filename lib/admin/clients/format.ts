// Affichage des fiches clients (PUR, testé). Champ vide = « Non renseigné » : aucune donnée inventée.
export const NOT_SET = 'Non renseigné';
export const upperName = (s: string) => (s ?? '').toLocaleUpperCase('fr-FR');
export const fullName = (first: string, last: string) => [upperName(last), first].map((x) => (x ?? '').trim()).filter(Boolean).join(' ') || NOT_SET;

const TZ = 'America/Guadeloupe';   // UTC−4, sans changement d'heure (comme le calendrier du site)
const dtf = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const dtfLong = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export function fmtDate(iso: string | null | undefined): string { if (!iso) return NOT_SET; const d = new Date(iso); return Number.isNaN(d.getTime()) ? NOT_SET : dtf.format(d); }
export function fmtDateTime(iso: string | null | undefined): string { if (!iso) return NOT_SET; const d = new Date(iso); return Number.isNaN(d.getTime()) ? NOT_SET : dtfLong.format(d).replace(',', ' à'); }
/** Date de naissance « YYYY-MM-DD » → « 04/05/1990 » sans passer par un fuseau. */
export function fmtBirth(b: string | null | undefined): string { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b ?? ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : NOT_SET; }
export const fmtEuros = (cents: number) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }).replace(/ | /g, ' ');

/** Âge en années à la date donnée (défaut : aujourd'hui) ; null si date absente ou invalide/future. */
export function ageFrom(birth: string | null | undefined, now: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth ?? ''); if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  let age = now.getUTCFullYear() - y - ((now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d)) ? 1 : 0);
  return age < 0 ? null : age;
}
export const AGE_MIN = 12, AGE_MAX = 100;
export const ageOutOfRange = (age: number | null) => age !== null && (age < AGE_MIN || age > AGE_MAX);

export type OrderStatusKey = 'pending' | 'paid' | 'expired' | 'cancelled' | 'partially_refunded' | 'refunded';
/** Libellé de statut d'une commande : gratuit = payée à 0 €. */
export function orderStatusLabel(status: string, totalCents: number): string {
  if (status === 'paid') return totalCents === 0 ? 'Gratuit' : 'Payé';
  return ({ pending: 'En attente', expired: 'Expirée', cancelled: 'Annulé', partially_refunded: 'Remboursé en partie', refunded: 'Remboursé' } as Record<string, string>)[status] ?? status;
}
export const TICKET_STATUS: Record<string, string> = { valid: 'Valide', used: 'Utilisé', cancelled: 'Annulé', refunded: 'Remboursé' };
