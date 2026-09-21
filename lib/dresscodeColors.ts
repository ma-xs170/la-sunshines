// Dresscode « par couleurs » : palette, autocomplétion (sans accents ni casse), migration douce depuis l'ancien texte libre.
// Stockage structuré : { colors: [{ name, hex }], free: boolean, note }. Fichier PUR (client + serveur, testé).

export interface DressColor { name: string; hex: string }
export interface DresscodeValue { colors: DressColor[]; free: boolean; note: string }

export const PALETTE: DressColor[] = [
  { name: 'Blanc', hex: '#F6F4EF' }, { name: 'Noir', hex: '#161616' }, { name: 'Rouge', hex: '#E4383B' }, { name: 'Bordeaux', hex: '#7A1F2B' },
  { name: 'Rose', hex: '#F35FA6' }, { name: 'Fuchsia', hex: '#D0158A' }, { name: 'Orange', hex: '#F08A24' }, { name: 'Corail', hex: '#FF7F6B' },
  { name: 'Jaune', hex: '#F4C430' }, { name: 'Doré', hex: '#D4AF37' }, { name: 'Beige', hex: '#D8C7A8' }, { name: 'Marron', hex: '#7A4A28' },
  { name: 'Vert', hex: '#3FA34D' }, { name: 'Kaki', hex: '#6B7042' }, { name: 'Turquoise', hex: '#2EC4B6' }, { name: 'Bleu', hex: '#2F6BD6' },
  { name: 'Bleu marine', hex: '#1B2A5C' }, { name: 'Violet', hex: '#8A4FCF' }, { name: 'Lavande', hex: '#B9A7E8' }, { name: 'Gris', hex: '#9AA0A6' },
  { name: 'Argenté', hex: '#C4C4C4' },
];
export const MAX_COLORS = 6;
export const NOTE_MAX = 140;

/** Minuscules, sans accents, espaces réduits : « Doré » et « dore » se valent. */
export const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Autocomplétion : « bor » → Bordeaux ; « marine » → Bleu marine ; les couleurs déjà choisies sont exclues. */
export function suggest(query: string, chosen: DressColor[] = [], limit = 6): DressColor[] {
  const q = fold(query);
  if (!q) return [];
  const taken = new Set(chosen.map((c) => fold(c.name)));
  const starts: DressColor[] = []; const inside: DressColor[] = [];
  for (const c of PALETTE) {
    if (taken.has(fold(c.name))) continue;
    const n = fold(c.name);
    if (n.startsWith(q) || n.split(' ').some((w) => w.startsWith(q))) starts.push(c); else if (n.includes(q)) inside.push(c);
  }
  return [...starts, ...inside].slice(0, limit);
}

const ALIASES: Record<string, string> = {
  green: 'Vert', red: 'Rouge', blue: 'Bleu', black: 'Noir', pink: 'Rose', white: 'Blanc', yellow: 'Jaune', purple: 'Violet', mauve: 'Violet',
  gold: 'Doré', or: 'Doré', silver: 'Argenté', argent: 'Argenté', brown: 'Marron', grey: 'Gris', gray: 'Gris', marine: 'Bleu marine', navy: 'Bleu marine',
};

/** Migration douce d'un ancien dresscode texte : couleurs reconnues → pastilles ; « libre » → tenue libre ; le reste → précision. */
export function parseLegacy(text: string): DresscodeValue {
  const raw = (text || '').trim();
  if (!raw) return { colors: [], free: false, note: '' };
  const f = fold(raw);
  const found: DressColor[] = [];
  const add = (c: DressColor | undefined) => { if (c && !found.some((x) => x.name === c.name) && found.length < MAX_COLORS) found.push(c); };
  const byName = (n: string) => PALETTE.find((c) => c.name === n);
  // « bleu marine » avant « bleu » : on consomme les expressions à plusieurs mots d'abord
  let rest = f;
  for (const c of PALETTE.filter((c) => c.name.includes(' '))) { const n = fold(c.name); if (rest.includes(n)) { add(c); rest = rest.replace(n, ' '); } }
  for (const w of rest.split(/[^a-z]+/).filter(Boolean)) add(PALETTE.find((c) => fold(c.name) === w) ?? byName(ALIASES[w]));
  if (found.length === 0) {
    const free = /\b(libre|free|no dress|sans)\b/.test(f);
    return { colors: [], free, note: free ? '' : raw.slice(0, NOTE_MAX) };
  }
  return { colors: found, free: false, note: '' };
}

/** Valide et nettoie une valeur reçue d'un formulaire (jamais de confiance côté client) : couleurs de la palette, « libre » exclusif, précision bornée. */
export function normalizeDresscode(v: unknown): DresscodeValue {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<DresscodeValue>;
  const free = o.free === true;
  const colors: DressColor[] = [];
  if (!free && Array.isArray(o.colors)) {
    for (const c of o.colors) {
      const p = PALETTE.find((x) => fold(x.name) === fold(String((c as DressColor)?.name ?? '')));
      if (p && !colors.some((x) => x.name === p.name) && colors.length < MAX_COLORS) colors.push(p);   // le hex vient TOUJOURS de la palette
    }
  }
  const note = typeof o.note === 'string' ? o.note.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, NOTE_MAX) : '';
  return { colors, free, note };
}

/** Texte lisible (billet, e-mail, lecteur d'écran) : « Bordeaux, Noir · Total look exigé » ou « Tenue libre ». */
export function dresscodeText(v: DresscodeValue): string {
  const base = v.free ? 'Tenue libre' : v.colors.map((c) => c.name).join(', ');
  return [base, v.note].filter(Boolean).join(' · ');
}

/** Teinte de texte lisible (noir ou blanc) sur une pastille de couleur : contraste WCAG. */
export function readableOn(hex: string): '#161616' | '#FFFFFF' {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#161616' : '#FFFFFF';
}
