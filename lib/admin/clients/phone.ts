// Téléphones : validation, normalisation et affichage. PUR (testé). La recherche côté base (phone_key) suit la même règle :
// 0690 12 34 56, +590 690 12 34 56 et 00590690123456 donnent la même clé (9 derniers chiffres).
export type PhoneResult = { ok: true; value: string } | { ok: false; error: string };

/** Vide accepté (champ facultatif). International : +indicatif puis 8 à 14 chiffres (+590, +596, +594, +262, +33, +1 721 SXM…). National : 0 + 9 chiffres. */
export function normalizePhone(raw: string): PhoneResult {
  const t = (raw ?? '').trim();
  if (t === '') return { ok: true, value: '' };
  if (!/^[+0-9 ().-]+$/.test(t)) return { ok: false, error: 'Numéro invalide : chiffres, espaces et « + » uniquement.' };
  let d = t.replace(/[ ().-]/g, '');
  if (d.startsWith('00')) d = '+' + d.slice(2);
  if (d.includes('+', 1)) return { ok: false, error: 'Numéro invalide : le « + » ne peut être qu’au début.' };
  if (d.startsWith('+')) {
    if (!/^\+[1-9][0-9]{7,14}$/.test(d)) return { ok: false, error: 'Numéro international invalide (ex. +590 690 12 34 56).' };
    return { ok: true, value: d };
  }
  if (!/^0[1-9][0-9]{8}$/.test(d)) return { ok: false, error: 'Numéro invalide (ex. 0690 12 34 56 ou +590 690 12 34 56).' };
  return { ok: true, value: d };
}

const pairs = (s: string) => s.replace(/(\d{2})(?=\d)/g, '$1 ');

/** Affichage lisible d'un numéro déjà normalisé (ou brut : renvoyé tel quel s'il n'est pas reconnu). */
export function formatPhone(v: string): string {
  const s = (v ?? '').trim(); if (!s) return '';
  const r = normalizePhone(s); if (!r.ok) return s;
  const n = r.value;
  if (!n.startsWith('+')) return pairs(n);
  const dom = /^\+(590|596|594|262)(\d{9})$/.exec(n); if (dom) return `+${dom[1]} ${dom[2].slice(0, 3)} ${pairs(dom[2].slice(3))}`;
  const fr = /^\+33(\d)(\d{8})$/.exec(n); if (fr) return `+33 ${fr[1]} ${pairs(fr[2])}`;
  const sxm = /^\+1(721)(\d{3})(\d{4})$/.exec(n); if (sxm) return `+1 ${sxm[1]} ${sxm[2]} ${sxm[3]}`;
  return n;
}

/** Même clé que public.phone_key (SQL) : 9 derniers chiffres, ou numéro partiel sans zéros de tête. */
export function phoneKey(v: string): string {
  const d = (v ?? '').replace(/\D/g, '');
  return d.length >= 9 ? d.slice(-9) : d.replace(/^0+/, '');
}
export const samePhone = (a: string, b: string) => { const ka = phoneKey(a), kb = phoneKey(b); return ka !== '' && ka === kb; };
