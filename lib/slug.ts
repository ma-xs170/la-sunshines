import { parseBizoukCode } from './bizoukEmbed';
// Helpers texte partagés admin / rendu.

/** "La Xploz · Tropical Island" -> "la-xploz-tropical-island" */
export function slugify(input: string): string {
  return (
    input
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // diacritiques
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'edition'
  );
}

/** Rend un slug unique vis-à-vis d'une liste existante (suffixe -2, -3, …). */
export function uniqueSlug(base: string, taken: string[]): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  let i = 2;
  while (set.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

/** URL de la page de réservation Bizouk d'un code d'intégration : uniquement une adresse bizouk.com validée (jamais une adresse arbitraire). */
export function bizoukUrlFromEmbed(embed: string | null | undefined): string | null {
  if (!embed) return null;
  const p = parseBizoukCode(embed);
  return p.ok ? p.pageUrl : null;
}
