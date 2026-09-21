// Variation entre deux périodes, affichée honnêtement : pas de « +∞ % » quand la période précédente est à zéro.
export function variation(current: number, previous: number): { text: string; tone: 'up' | 'down' | 'flat' } {
  if (previous <= 0) return current > 0 ? { text: 'nouveau', tone: 'up' } : { text: '—', tone: 'flat' };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { text: `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)} %`, tone: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}
