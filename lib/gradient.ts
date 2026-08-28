// Phase 3 — dégradés dérivés de la palette d'un flyer.
//
// `FLYER_PALETTES` (généré au build) donne jusqu'à 3 teintes par flyer. On en
// tire un dégradé riche pour le hero des pages /editions/[slug]. Un voile sombre
// est appliqué par-dessus en CSS pour garantir la lisibilité du texte blanc.

function parseHex(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Luminance relative approx. (0 = noir, 1 = blanc). */
function luminance([r, g, b]: [number, number, number]): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function darken(hex: string, amount: number): string {
  const rgb = parseHex(hex).map((v) => v * (1 - amount)) as [number, number, number];
  return toHex(rgb);
}

function mix(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex([
    x[0] + (y[0] - x[0]) * t,
    x[1] + (y[1] - x[1]) * t,
    x[2] + (y[2] - x[2]) * t,
  ]);
}

/** `#rrggbb` -> `rgba(r, g, b, a)` (utilisé pour les voiles teintés). */
export function rgba(hex: string, a: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Teinte lisible pour un voile : la ramène dans une plage ni trop sombre ni
 *  trop claire pour que le dégradé reste coloré quel que soit le flyer. */
export function washTint(dominant: string | null | undefined): string {
  const hex = dominant && /^#[0-9a-f]{6}$/i.test(dominant) ? dominant : '#6a4b2c';
  const l = luminance(parseHex(hex));
  if (l < 0.12) return mix(hex, '#ffffff', 0.22); // éclaircit un flyer très sombre
  if (l > 0.75) return darken(hex, 0.35); // fonce un flyer très clair
  return hex;
}

/* ---------- HSL <-> RGB ---------- */

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

function hslToHex([h, s, l]: [number, number, number]): string {
  if (s === 0) {
    const v = Math.round(l * 255);
    return toHex([v, v, v]);
  }
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return toHex([
    Math.round(hue(p, q, h + 1 / 3) * 255),
    Math.round(hue(p, q, h) * 255),
    Math.round(hue(p, q, h - 1 / 3) * 255),
  ]);
}

/**
 * Teinte d'accent VIVE dérivée du flyer, garantie perceptible sur le fond crème.
 * On garde la TEINTE (hue) de la couleur la plus colorée du flyer, mais on
 * remonte la saturation et on cale la luminosité au milieu. Sans ça, les flyers
 * à fond sombre (La Nuit, Before Christmas…) donnaient un voile quasi invisible.
 *
 * @param spread décale la teinte de ±deg pour générer des variantes (blobs).
 */
export function vividAccent(
  palette: string[] | undefined,
  dominant: string | null | undefined,
  opts: { spread?: number; light?: number; sat?: number } = {},
): string {
  const pool = [...(palette ?? []), ...(dominant ? [dominant] : [])].filter((h) =>
    /^#[0-9a-f]{6}$/i.test(h),
  );
  if (pool.length === 0) return '#e8a33d'; // repli amber

  let best = pool[0];
  let bestScore = -1;
  for (const hex of pool) {
    const [, s, l] = rgbToHsl(parseHex(hex));
    // privilégie la teinte la plus saturée, sans être quasi noire/blanche
    const score = s * (1 - Math.abs(l - 0.5) * 0.55);
    if (score > bestScore) {
      bestScore = score;
      best = hex;
    }
  }

  let [h, s] = rgbToHsl(parseHex(best));
  if (opts.spread) h = (((h + opts.spread / 360) % 1) + 1) % 1;
  s = Math.max(s, opts.sat ?? 0.62);
  const l = opts.light ?? 0.56;
  return hslToHex([h, s, l]);
}

/** Palette nettoyée : on écarte les quasi-blancs / quasi-noirs et les doublons. */
export function usablePalette(palette: string[]): string[] {
  const out: string[] = [];
  for (const hex of palette) {
    const l = luminance(parseHex(hex));
    if (l > 0.9 || l < 0.025) continue;
    if (out.some((o) => o.toLowerCase() === hex.toLowerCase())) continue;
    out.push(hex);
  }
  return out;
}

/**
 * Dégradé CSS pour le hero d'une page événement.
 * Toujours au moins 2 stops, terminé par une teinte assombrie pour la profondeur.
 */
export function heroGradient(
  palette: string[] | undefined,
  dominant: string | null | undefined,
): string {
  let colors = usablePalette(palette ?? []);
  if (colors.length === 0 && dominant) colors = usablePalette([dominant]);
  if (colors.length === 0) colors = ['#3a2a4a'];

  if (colors.length === 1) {
    const c = colors[0];
    return `linear-gradient(140deg, ${mix(c, '#ffffff', 0.12)} 0%, ${c} 45%, ${darken(
      c,
      0.45,
    )} 100%)`;
  }
  if (colors.length === 2) {
    return `linear-gradient(140deg, ${colors[0]} 0%, ${colors[1]} 55%, ${darken(
      colors[1],
      0.4,
    )} 100%)`;
  }
  return `linear-gradient(140deg, ${colors[0]} 0%, ${colors[1]} 45%, ${colors[2]} 78%, ${darken(
    colors[2],
    0.35,
  )} 100%)`;
}
