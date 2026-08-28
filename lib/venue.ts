// Le lieu d'une édition est-il réellement communiqué, ou est-ce le placeholder ?
//
// Règle (cf. lib/editions.ts) : tant que le lieu n'est pas annoncé sur Bizouk,
// on utilise le placeholder « SUN'LAND » (avec ou sans suffixe géographique).
export function isVenuePublic(venue: string | null | undefined): boolean {
  if (!venue) return false;
  const v = venue.trim().toLowerCase();
  if (!v) return false;
  return !/^sun.?land\b/.test(v);
}
