// Garde-fou données : certains champs artiste/headliner/line-up contiennent des
// entrées qui désignent l'ORGANISATION (« DJ La Sunshines », « DJ Sunshines »,
// « DJ La Xploz »…) et non un vrai artiste. On les écarte partout.

const ORG_NAME_RE = /^(dj\s+)?(la\s+)?(sunshines?|xploz)$/i;

/**
 * Forme canonique d'un nom d'artiste pour comparaison / correspondance de profil
 * (casse, espaces multiples, préfixe « DJ »). « DJ Syxtee » et « syxtee » => « syxtee ».
 */
export function normalizeArtistName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^dj\s+/, '');
}

export function isOrgName(name: string): boolean {
  return ORG_NAME_RE.test(name.trim());
}

/** Retire les entrées « nom de l'organisation » d'une liste d'artistes. */
export function stripOrgNames(names: string[]): string[] {
  return names.filter((n) => !isOrgName(n));
}

/** Nettoie un champ headliner (« A · B · C ») des entrées organisation. */
export function cleanHeadliner(headliner?: string): string | undefined {
  if (!headliner) return headliner;
  const parts = headliner
    .split(/\s*·\s*/)
    .map((p) => p.trim())
    .filter((p) => p && !isOrgName(p));
  return parts.length ? parts.join(' · ') : undefined;
}
