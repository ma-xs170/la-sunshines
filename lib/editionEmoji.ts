// Résolution de l'emoji d'une édition — Phase 1.
//
// Règle : le mot-clé du nom gagne, la couleur dominante du flyer sert de repli.
//   1. Si le nom de l'édition matche un mot-clé thématique -> on prend cet emoji.
//   2. Sinon, on mappe la couleur dominante du flyer (`dominantColor`) vers un
//      emoji pastille de teinte.
//   3. Sinon (pas de flyer, pas de mot-clé) -> emoji générique ✨.
//
// La couleur dominante est extraite au build par `scripts/extract-flyer-colors.mjs`
// et stockée dans `lib/flyerColors.generated.ts`.

/** Mots-clés du nom -> emoji. Ordre = priorité (premier match gagné). */
export const KEYWORD_EMOJI: { test: RegExp; emoji: string }[] = [
  { test: /no[eë]l|christmas/i, emoji: '🎄' },
  { test: /candy|bonbon/i, emoji: '🍬' },
  { test: /picasso|art\b/i, emoji: '🎨' },
  { test: /dominica/i, emoji: '🏝️' },
  { test: /tropical|island|[iî]le/i, emoji: '🌴' },
  { test: /nuit|ombre|night|dark|shadow/i, emoji: '🌙' },
  { test: /xploz|explos|boom|blast/i, emoji: '💥' },
  { test: /love|valentin|amour|c[œoe]ur/i, emoji: '💛' },
  { test: /sun|soleil|summer|[ée]t[ée]\b/i, emoji: '☀️' },
];

/** Clé de teinte -> emoji pastille. */
export const COLOR_EMOJI: Record<string, string> = {
  red: '🔴',
  orange: '🟠',
  yellow: '🟡',
  green: '🟢',
  blue: '🔵',
  purple: '🟣',
  pink: '🩷',
  brown: '🟤',
  black: '⚫',
  white: '⚪',
};

/** Emoji de dernier recours. */
export const FALLBACK_EMOJI = '✨';

/** #rrggbb (ou #rgb) -> [r, g, b] 0-255. */
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Couleur hex -> clé de teinte (`red`, `blue`, `black`, `white`…). */
export function hexToColorKey(hex: string): string | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => v / 255) as [number, number, number];

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  // Très sombre / très clair : lu comme noir ou blanc quelle que soit la teinte.
  if (lightness < 0.14) return 'black';
  if (lightness > 0.92) return 'white';

  // Neutres : on regarde d'abord clair/sombre avant la teinte.
  if (saturation < 0.15 || delta < 0.06) {
    if (lightness < 0.28) return 'black';
    if (lightness > 0.78) return 'white';
    // gris moyen -> pas d'info exploitable
    return null;
  }

  let hue: number;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;

  // Rose = rouge/magenta clair et peu saturé.
  if ((hue >= 300 || hue < 15) && lightness > 0.6 && saturation < 0.75) {
    return 'pink';
  }
  // Marron = orange sombre.
  if (hue >= 15 && hue < 45 && lightness < 0.35) return 'brown';

  if (hue < 15 || hue >= 345) return 'red';
  if (hue < 45) return 'orange';
  if (hue < 70) return 'yellow';
  if (hue < 170) return 'green';
  if (hue < 255) return 'blue';
  if (hue < 300) return 'purple';
  return 'pink';
}

/** Emoji thématique déduit du nom seul, sinon `null`. */
export function emojiFromName(name: string): string | null {
  for (const { test, emoji } of KEYWORD_EMOJI) {
    if (test.test(name)) return emoji;
  }
  return null;
}

/** Emoji pastille déduit de la couleur dominante, sinon `null`. */
export function emojiFromColor(dominantColor: string | null | undefined): string | null {
  if (!dominantColor) return null;
  const key = hexToColorKey(dominantColor);
  return key ? COLOR_EMOJI[key] ?? null : null;
}

/** Résolution finale : mot-clé > couleur > repli. */
export function resolveEmoji(input: {
  name: string;
  dominantColor?: string | null;
}): string {
  return (
    emojiFromName(input.name) ??
    emojiFromColor(input.dominantColor) ??
    FALLBACK_EMOJI
  );
}
