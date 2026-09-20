// Liaison texte libre → profils artistes (Programme). Pur : utilisable côté
// serveur (rendu public) ET client (aperçu de l'éditeur admin).
//
// Un texte de programme (« DJ Sosonne · DJ Dalton », « Timalash & Lil Scott »)
// est découpé en segments : les noms restent candidats à un lien, les
// séparateurs (·, &, virgule, x, feat, +, /) restent du texte simple.

export interface LinkableArtist {
  slug: string;
  name: string;
}

export type ArtistSegment = { text: string; slug?: string };

/** Clé de comparaison : sans casse, sans accents, sans préfixe « DJ » / « MC ». */
export function artistMatchKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(dj|mc)\s+/, '');
}

// Séparateurs entre deux artistes. Les tirets cadratin/demi-cadratin coupent
// avec ou sans espaces ; le trait d'union simple seulement entouré d'espaces
// (« Jeune-Aber » reste un nom). « x » et « feat/ft » exigent des espaces pour
// ne pas couper « Xploz » ou « Ft. Lauderdale ».
const SEPARATOR_RE =
  /(\s*(?:·|&|,|\+|\/|—|–)\s*|\s+-\s+|\s+(?:x|feat\.?|ft\.?|featuring)\s+)/i;

/** Nom d'artiste connu en TÊTE d'un libellé (« Dreezy Keyboard Show » → dreezy),
 *  aux frontières de mots ; le plus long nom l'emporte. */
function leadingArtist(key: string, index: Map<string, string>): string | undefined {
  const words = key.split(' ');
  for (let n = words.length - 1; n >= 1; n--) {
    const slug = index.get(words.slice(0, n).join(' '));
    if (slug) return slug;
  }
  return undefined;
}

/** Index clé → slug (nom ET slug de chaque profil ; le premier profil l'emporte). */
export function buildArtistIndex(artists: LinkableArtist[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of artists) {
    for (const k of [artistMatchKey(a.name), artistMatchKey(a.slug)]) {
      if (k && !m.has(k)) m.set(k, a.slug);
    }
  }
  return m;
}

/**
 * Découpe `text` en segments, chacun éventuellement lié à un profil.
 *  - `explicitSlugs` (lien posé dans l'admin) est PRIORITAIRE sur l'automatique :
 *    autant de noms que de slugs → correspondance par ordre ; un seul slug →
 *    tout le texte y pointe ; sinon les noms retrouvés parmi ces slugs sont liés.
 *    Un slug qui ne correspond plus à aucun profil est ignoré (aucun lien mort).
 *  - sans lien explicite, chaque nom est comparé à l'index (nom, slug).
 */
export function linkArtistText(
  text: string,
  artists: LinkableArtist[],
  explicitSlugs?: string[],
): ArtistSegment[] {
  const bySlug = new Set(artists.map((a) => a.slug));
  const index = buildArtistIndex(artists);
  const explicit = (explicitSlugs ?? []).filter((s) => bySlug.has(s));

  // Un nom qui contient lui-même un séparateur (« Nom & Nom ») reste un seul lien.
  const lookup = (t: string) => index.get(artistMatchKey(t)) ?? leadingArtist(artistMatchKey(t), index);
  const whole = index.get(artistMatchKey(text));
  if (explicit.length === 0 && whole) return [{ text, slug: whole }];

  const parts = text.split(SEPARATOR_RE); // [nom, sep, nom, sep, …]
  const nameIdx = parts.map((_, i) => i).filter((i) => i % 2 === 0 && parts[i].trim());

  if (explicit.length === 1 && nameIdx.length <= 1) return [{ text, slug: explicit[0] }];

  return parts.map((p, i) => {
    if (i % 2 === 1 || !p.trim()) return { text: p };
    let slug: string | undefined;
    if (explicit.length > 0) {
      const auto = lookup(p);
      if (explicit.length === nameIdx.length) slug = explicit[nameIdx.indexOf(i)];
      else if (auto && explicit.includes(auto)) slug = auto;
    } else {
      slug = lookup(p);
    }
    return slug ? { text: p, slug } : { text: p };
  });
}
