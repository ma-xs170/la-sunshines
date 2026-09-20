// Liaison texte libre → profils artistes (Programme). Pur : utilisable côté
// serveur (rendu public) ET client (admin : analyse avant enregistrement).
//
// Un texte de programme (« DJ Sosonne · DJ Dalton », « Ayou — Tchambou »,
// « Dreezy Keyboard Show ») est découpé en segments typés :
//   name → un nom d'artiste (lié à un profil s'il existe), sep → séparateur,
//   text → mots descriptifs (« Keyboard Show »), blancs.

export interface LinkableArtist {
  slug: string;
  name: string;
  /** graphies alternatives (fautes fréquentes, noms de scène…). */
  aliases?: string[];
}

export type SegmentKind = 'name' | 'sep' | 'text';
export type ArtistSegment = { text: string; kind: SegmentKind; slug?: string };

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

// Séparateurs entre deux artistes. Tirets longs, « · » et virgule coupent avec ou
// sans espaces ; « & + / - x feat ft b2b vs » exigent des espaces autour (« Jeune-Aber »,
// « Xploz » restent entiers). « et » ne sépare jamais (« Lil Scott », « Dega Youth »).
const SEPARATOR_RE =
  /(\s*(?:·|,|—|–)\s*|\s+(?:&|\+|\/|-|x|feat\.?|ft\.?|featuring|b2b|vs\.?)\s+)/i;

/** Index clé → slug (nom, slug ET alias de chaque profil ; le premier profil l'emporte). */
export function buildArtistIndex(artists: LinkableArtist[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of artists) {
    for (const k of [a.name, a.slug, ...(a.aliases ?? [])].map(artistMatchKey)) {
      if (k && !m.has(k)) m.set(k, a.slug);
    }
  }
  return m;
}

type Unit = { pre: string; lead: string; rest: string; post: string; slug?: string };

/** Un segment « nom » : correspondance exacte, sinon artiste connu en TÊTE suivi de
 *  mots descriptifs (« Dreezy Keyboard Show » → lead « Dreezy », rest « Keyboard Show »). */
function resolveUnit(p: string, index: Map<string, string>): Unit {
  const core = p.trim();
  const pre = p.slice(0, p.indexOf(core));
  const post = p.slice(pre.length + core.length);
  const exact = index.get(artistMatchKey(core));
  if (exact) return { pre, lead: core, rest: '', post, slug: exact };
  const toks = [...core.matchAll(/\S+/g)];
  for (let n = toks.length - 1; n >= 1; n--) {
    const end = toks[n - 1].index! + toks[n - 1][0].length;
    const slug = index.get(artistMatchKey(core.slice(0, end)));
    if (slug) return { pre, lead: core.slice(0, end), rest: core.slice(end), post, slug };
  }
  return { pre, lead: core, rest: '', post };
}

/**
 * Découpe `text` en segments typés, les noms étant liés aux profils connus.
 *  - `explicitSlugs` (lien posé dans l'admin) est PRIORITAIRE sur l'automatique :
 *    autant de noms que de slugs → correspondance par ordre ; un seul slug →
 *    le nom unique y pointe ; sinon seuls les noms retrouvés parmi ces slugs sont liés.
 *    Un slug qui ne correspond plus à aucun profil est ignoré (aucun lien mort).
 *  - sans lien explicite, chaque nom est comparé à l'index (nom, slug, alias).
 */
export function linkArtistText(
  text: string,
  artists: LinkableArtist[],
  explicitSlugs?: string[],
): ArtistSegment[] {
  const known = new Set(artists.map((a) => a.slug));
  const index = buildArtistIndex(artists);
  const explicit = (explicitSlugs ?? []).filter((s) => known.has(s));

  // Un nom qui contient lui-même un séparateur (« Duo A & B ») reste un seul lien.
  const whole = index.get(artistMatchKey(text));
  if (explicit.length === 0 && whole) return [{ text, kind: 'name', slug: whole }];

  const parts = text.split(SEPARATOR_RE); // [nom, sép, nom, sép, …]
  const units = parts.map((p, i) => (i % 2 === 1 || !p.trim() ? null : resolveUnit(p, index)));
  const nameIdx = units.flatMap((u, i) => (u ? [i] : []));

  const out: ArtistSegment[] = [];
  parts.forEach((p, i) => {
    const u = units[i];
    if (!u) return void out.push({ text: p, kind: i % 2 === 1 ? 'sep' : 'text' });
    let slug = u.slug;
    if (explicit.length === 1 && nameIdx.length <= 1) slug = explicit[0];
    else if (explicit.length > 0 && explicit.length === nameIdx.length) slug = explicit[nameIdx.indexOf(i)];
    else if (explicit.length > 0) slug = slug && explicit.includes(slug) ? slug : undefined;
    if (u.pre) out.push({ text: u.pre, kind: 'text' });
    out.push(slug ? { text: u.lead, kind: 'name', slug } : { text: u.lead, kind: 'name' });
    if (u.rest) out.push({ text: u.rest, kind: 'text' });
    if (u.post) out.push({ text: u.post, kind: 'text' });
  });
  return out;
}

/* ---------------- Type de ligne : « Artiste(s) » ou « Information » ---------------- */

export type RowKind = 'artist' | 'info';

const INFO_RE = /\b(ouverture|fermeture|fin|pause|entracte)\b/;

/** Ligne d'information (portes, pause, fin…) : jamais de lien ni de profil. */
export function isInfoLine(text: string): boolean {
  return INFO_RE.test(text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
}

/**
 * Type effectif : le choix explicite de l'organisateur l'emporte ; sinon une ligne
 * dans un bloc (WARMUP, SHOW DJ, SHOWCASE…) est « artiste » ; sinon une ligne seule
 * qui contient ouverture / fermeture / fin / pause est « information ».
 */
export function effectiveRowKind(text: string, explicit?: RowKind, inBlock = false): RowKind {
  if (explicit === 'artist' || explicit === 'info') return explicit;
  if (inBlock) return 'artist';
  return isInfoLine(text) ? 'info' : 'artist';
}

/* ---------------- Fautes de frappe ---------------- */

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Artiste existant « très proche » (1 lettre d'écart jusqu'à 5 caractères, 2 au-delà). */
export function nearestArtist(
  name: string,
  artists: LinkableArtist[],
): { slug: string; name: string; distance: number } | undefined {
  const key = artistMatchKey(name);
  if (key.length < 3) return undefined;
  const limit = key.length <= 5 ? 1 : 2;
  let best: { slug: string; name: string; distance: number } | undefined;
  for (const a of artists) {
    for (const k of [a.name, a.slug, ...(a.aliases ?? [])].map(artistMatchKey)) {
      if (!k || Math.abs(k.length - key.length) > limit) continue;
      const d = levenshtein(key, k);
      if (d > 0 && d <= limit && (!best || d < best.distance)) best = { slug: a.slug, name: a.name, distance: d };
    }
  }
  return best;
}

/* ---------------- Plan d'enregistrement du programme ---------------- */

export interface PlanRowInput {
  artistName: string;
  kind?: RowKind;
  artistSlugs?: string[];
}
export interface SchedulePlan {
  /** noms reconnus → profil existant (dédoublonnés) */
  links: { name: string; slug: string; profile: string }[];
  /** noms sans profil ni voisin proche → profil minimal à créer (dédoublonnés) */
  creates: { key: string; name: string }[];
  /** noms très proches d'un profil existant → à trancher : lier (alias) ou créer */
  suggestions: { key: string; name: string; candidate: { slug: string; name: string } }[];
}

/** Un nom exploitable : pas « DJ » / « MC » seuls, pas d'un seul caractère. */
export function isUsableName(name: string): boolean {
  const key = artistMatchKey(name);
  return key.length >= 2 && !/^(dj|mc)$/.test(key.replace(/\s/g, '')) && /[\p{L}\p{N}]/u.test(key);
}

/**
 * Analyse chaque ligne « artiste » (jamais les lignes « information »). Purement
 * calculatoire : rien n'est créé ici — l'admin affiche ce plan, l'organisateur confirme.
 */
export function planScheduleArtists(
  rows: PlanRowInput[],
  artists: LinkableArtist[],
  opts: { ignore?: (name: string) => boolean } = {},
): SchedulePlan {
  const plan: SchedulePlan = { links: [], creates: [], suggestions: [] };
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.artistName.trim() || effectiveRowKind(row.artistName, row.kind) === 'info') continue;
    for (const seg of linkArtistText(row.artistName, artists, row.artistSlugs)) {
      if (seg.kind !== 'name') continue;
      const key = artistMatchKey(seg.text);
      if (seen.has(`${key}|${seg.slug ?? ''}`)) continue;
      seen.add(`${key}|${seg.slug ?? ''}`);
      if (seg.slug) {
        const profile = artists.find((a) => a.slug === seg.slug)?.name ?? seg.slug;
        plan.links.push({ name: seg.text, slug: seg.slug, profile });
        continue;
      }
      if (!isUsableName(seg.text) || opts.ignore?.(seg.text)) continue;
      const near = nearestArtist(seg.text, artists);
      if (near) plan.suggestions.push({ key, name: seg.text, candidate: { slug: near.slug, name: near.name } });
      else plan.creates.push({ key, name: seg.text });
    }
  }
  return plan;
}
