// Mappe les mots-clés couleur d'un texte de dresscode (FR + EN) vers des valeurs
// CSS, pour teinter automatiquement la pastille « tenue » de chaque édition.

const COLOR_KEYWORDS: Record<string, string> = {
  vert: '#3FA34D', green: '#3FA34D',
  rouge: '#E4383B', red: '#E4383B',
  bleu: '#2F6BD6', blue: '#2F6BD6',
  noir: '#161616', black: '#161616',
  rose: '#F35FA6', pink: '#F35FA6',
  blanc: '#F6F4EF', white: '#F6F4EF',
  orange: '#F08A24',
  jaune: '#F4C430', yellow: '#F4C430',
  violet: '#8A4FCF', purple: '#8A4FCF', mauve: '#8A4FCF',
  or: '#D4AF37', gold: '#D4AF37', dore: '#D4AF37', doré: '#D4AF37',
  argent: '#C4C4C4', silver: '#C4C4C4',
  marron: '#7A4A28', brown: '#7A4A28',
  gris: '#9AA0A6', grey: '#9AA0A6', gray: '#9AA0A6',
  turquoise: '#2EC4B6',
  beige: '#D8C7A8',
};

/** Couleurs trouvées dans le texte, dans l'ordre d'apparition, dédupliquées. */
export function dresscodeColors(dresscode: string): string[] {
  const tokens = (dresscode || '')
    .toLowerCase()
    .split(/[^a-zà-ÿ]+/)
    .filter(Boolean);
  const out: string[] = [];
  for (const t of tokens) {
    const hex = COLOR_KEYWORDS[t];
    if (hex && !out.includes(hex)) out.push(hex);
  }
  return out;
}

/**
 * Dégradé CSS pour la pastille tenue :
 *  - 0 couleur   -> null (pastille neutre)
 *  - 1 couleur   -> aplat
 *  - 2+ couleurs -> bandes diagonales nettes (pastille bicolore / tricolore)
 */
export function dresscodeGradient(dresscode: string): string | null {
  const cols = dresscodeColors(dresscode);
  if (cols.length === 0) return null;
  if (cols.length === 1) return cols[0];
  const n = cols.length;
  const stops = cols
    .map((c, i) => {
      const from = Math.round((i / n) * 100);
      const to = Math.round(((i + 1) / n) * 100);
      return `${c} ${from}% ${to}%`;
    })
    .join(', ');
  return `linear-gradient(135deg, ${stops})`;
}

/**
 * Libellé affiché de la pill dresscode : « DRESSCODE · <valeur> ».
 * Ex. "Dresscode Bleu ou Noir" -> "Dresscode · Bleu ou Noir"
 *     "White & Pink"           -> "Dresscode · White & Pink"
 * (les majuscules sont appliquées en CSS.)
 */
export function formatDresscodeLabel(dresscode: string): string {
  const m = dresscode.trim().match(/^dresscode\s+(.*)$/i);
  const value = (m ? m[1] : dresscode).trim();
  return value ? `Dresscode · ${value}` : 'Dresscode';
}
