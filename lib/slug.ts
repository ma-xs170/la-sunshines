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

/** Extrait la 1re URL Bizouk d'un code d'intégration brut (iframe/script/lien). */
export function bizoukUrlFromEmbed(embed: string | null | undefined): string | null {
  if (!embed) return null;
  const m = embed.match(/https?:\/\/[^\s"'<>]*bizouk[^\s"'<>]*/i);
  return m ? m[0] : null;
}
