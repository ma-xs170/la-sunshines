// Formatage de date partagé — une seule source de vérité pour toutes les
// dates affichées (cartes édition, /editions, pages événement, bandeau CTA).

const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const MONTHS_SHORT = [
  'Janv.', 'Févr.', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.',
];
const WEEKDAYS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];

function parseISO(dateISO: string): { d: number; m: number; y: number; wd: number } | null {
  const [y, m, d] = dateISO.split('-').map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { d, m, y, wd };
}

/** "2026-10-17" -> "Sam. 17 Octobre" (jour abrégé + chiffre + mois en toutes lettres). */
export function formatEditionDate(dateISO: string | null | undefined): string {
  if (!dateISO) return '';
  const p = parseISO(dateISO);
  return p ? `${WEEKDAYS[p.wd]} ${p.d} ${MONTHS[p.m - 1]}` : '';
}

/** "2026-10-17" -> "17 Oct." (forme compacte, ex. gros affichage du bandeau CTA). */
export function formatEditionDateShort(dateISO: string | null | undefined): string {
  if (!dateISO) return '';
  const p = parseISO(dateISO);
  return p ? `${p.d} ${MONTHS_SHORT[p.m - 1]}` : '';
}
