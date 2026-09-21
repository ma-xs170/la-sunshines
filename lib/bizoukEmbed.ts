// Code d'intégration Bizouk : ANALYSE et RÉGÉNÉRATION, jamais d'injection du code collé (risque XSS).
// On n'extrait que l'identifiant d'évènement Bizouk ; le domaine doit être exactement bizouk.com / www.bizouk.com (liste blanche).
// Le widget est ensuite reconstruit par NOTRE code (iframe à attributs fixes + sandbox) : aucun autre octet du code collé n'est conservé.
// PUR (testé) : aucune dépendance serveur.

export const BIZOUK_HOSTS = ['bizouk.com', 'www.bizouk.com'] as const;
export const BIZOUK_SCRIPT_HOSTS = ['static.bizouk.com', ...BIZOUK_HOSTS] as const;
/** Attributs du bac à sable : le widget garde ses formulaires, ses fenêtres de paiement (3-D Secure) et son script, mais pas la navigation automatique de la page. */
export const BIZOUK_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-top-navigation-by-user-activation';
const MAX = 4000;

export type BizoukParse = { ok: true; eventId: string; src: string; pageUrl: string } | { ok: false; message: string };
export const bizoukSrc = (eventId: string) => `https://www.bizouk.com/stores/reservation/place?event=${eventId}&widget=1`;

const bad = (message: string): BizoukParse => ({ ok: false, message });

export function parseBizoukCode(input: string | null | undefined): BizoukParse {
  const raw = (input ?? '').trim();
  if (!raw) return bad('Colle le code d’intégration fourni par Bizouk.');
  if (raw.length > MAX) return bad('Ce code est trop long pour être un code d’intégration Bizouk.');
  // 1. Tout ce qui est actif et n'est pas du Bizouk est refusé : scripts en ligne, gestionnaires d'évènements, javascript:, data:, autres balises actives.
  if (/<\s*(object|embed|form|link|meta|base|svg|math|style|img|video|audio|body|html)\b/i.test(raw)) return bad('Code refusé : il contient des éléments qui ne font pas partie d’un code d’intégration Bizouk.');
  if (/\son[a-z]+\s*=/i.test(raw) || /javascript\s*:|data\s*:|vbscript\s*:|srcdoc\s*=/i.test(raw)) return bad('Code refusé : il contient du code exécutable.');
  for (const m of raw.matchAll(/<\s*script\b([^>]*)>([\s\S]*?)<\s*\/\s*script\s*>/gi)) {
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(m[1])?.[1];
    if (!src || m[2].trim() !== '') return bad('Code refusé : script en ligne non autorisé.');
    let u: URL; try { u = new URL(src); } catch { return bad('Code refusé : script illisible.'); }
    if (u.protocol !== 'https:' || !(BIZOUK_SCRIPT_HOSTS as readonly string[]).includes(u.hostname)) return bad('Code refusé : script provenant d’un site autre que Bizouk.');
  }
  if (/<\s*script\b(?![^>]*>[\s\S]*?<\s*\/\s*script\s*>)/i.test(raw)) return bad('Code refusé : balise script incomplète.');
  // 2. Toutes les URL présentes doivent appartenir à Bizouk.
  const urls = raw.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];
  if (urls.length === 0) return bad('Ce code ne ressemble pas à un code d’intégration Bizouk : aucune adresse trouvée.');
  let eventId = '';
  for (const s of urls) {
    let u: URL; try { u = new URL(s.replace(/&amp;/g, '&')); } catch { return bad('Code refusé : adresse illisible.'); }
    if (u.protocol !== 'https:' || u.username || u.password || !(BIZOUK_SCRIPT_HOSTS as readonly string[]).includes(u.hostname)) return bad('Code refusé : une adresse ne provient pas de bizouk.com.');
    const id = u.searchParams.get('event');
    if (u.pathname === '/stores/reservation/place' && id && /^[0-9]{1,9}$/.test(id)) { if (eventId && eventId !== id) return bad('Ce code contient plusieurs évènements différents.'); eventId = id; }
  }
  if (!eventId) return bad('Identifiant d’évènement Bizouk introuvable dans ce code. Colle le code « intégrer » complet de ta page Bizouk.');
  return { ok: true, eventId, src: bizoukSrc(eventId), pageUrl: `https://www.bizouk.com/stores/reservation/place?event=${eventId}` };
}
