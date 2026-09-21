// Canal d'une visite d'après le site de provenance (referrer). Fonctions PURES (testées).
export type ViewSource = 'direct' | 'instagram' | 'tiktok' | 'facebook' | 'whatsapp' | 'google' | 'site' | 'autre';

export const SOURCE_LABEL: Record<string, string> = {
  direct: 'Accès direct', instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', whatsapp: 'WhatsApp', google: 'Google', site: 'Le site LA SUNSHINES', autre: 'Autre site',
};

export function sourceOf(refHost: string, ownHost: string): ViewSource {
  const h = refHost.toLowerCase().replace(/^www\./, '');
  if (!h) return 'direct';
  if (h === ownHost.toLowerCase().replace(/^www\./, '')) return 'site';
  if (/(^|\.)(instagram\.com|l\.instagram\.com)$/.test(h)) return 'instagram';
  if (/(^|\.)tiktok\.com$/.test(h)) return 'tiktok';
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me|m\.facebook\.com|l\.facebook\.com)$/.test(h)) return 'facebook';
  if (/(^|\.)(whatsapp\.com|wa\.me)$/.test(h)) return 'whatsapp';
  if (/(^|\.)google\.[a-z.]+$/.test(h)) return 'google';
  return 'autre';
}

const FR = new Intl.DisplayNames(['fr'], { type: 'region' });
/** Nom d'un pays en français à partir de son code ISO (« GP » → « Guadeloupe »). */
export function countryName(code: string): string { try { return FR.of(code) ?? code; } catch { return code; } }
