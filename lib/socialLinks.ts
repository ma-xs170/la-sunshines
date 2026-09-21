// Réseaux sociaux d'un évènement / d'une organisation : pseudo, @pseudo ou URL complète acceptés, normalisés en https.
export type Network = 'instagram' | 'tiktok' | 'facebook' | 'snapchat' | 'whatsapp' | 'youtube';
export const NETWORKS: { id: Network; label: string }[] = [
  { id: 'instagram', label: 'Instagram' }, { id: 'tiktok', label: 'TikTok' }, { id: 'facebook', label: 'Facebook' },
  { id: 'snapchat', label: 'Snapchat' }, { id: 'whatsapp', label: 'WhatsApp' }, { id: 'youtube', label: 'YouTube' },
];
const HOSTS: Record<Network, RegExp> = {
  instagram: /(^|\.)instagram\.com$/, tiktok: /(^|\.)tiktok\.com$/, facebook: /(^|\.)(facebook|fb)\.com$/,
  snapchat: /(^|\.)snapchat\.com$/, whatsapp: /^(wa\.me|chat\.whatsapp\.com|api\.whatsapp\.com|whatsapp\.com)$/, youtube: /(^|\.)(youtube\.com|youtu\.be)$/,
};
const HANDLE = /^[A-Za-z0-9._-]{1,60}$/;

/** Renvoie l'URL https normalisée, '' si vide, ou null si invalide (mauvais domaine, schéma dangereux, pseudo incorrect). */
export function normalizeSocial(network: Network, input: string): string | null {
  const v = (input ?? '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v) || /^(www\.)?[a-z0-9.-]+\.[a-z]{2,}\//i.test(v)) {
    let u: URL;
    try { u = new URL(/^https?:/i.test(v) ? v : 'https://' + v); } catch { return null; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!HOSTS[network].test(u.hostname.toLowerCase())) return null;
    u.protocol = 'https:'; u.username = ''; u.password = ''; u.hash = '';
    return u.toString().replace(/\/$/, '');
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) && !/^\+?\d/.test(v)) return null;   // javascript:, data:, mailto:…
  const handle = v.replace(/^@/, '');
  if (network === 'whatsapp') {
    const digits = v.replace(/[\s.()-]/g, '').replace(/^\+/, '');
    return /^\d{8,15}$/.test(digits) ? `https://wa.me/${digits}` : null;
  }
  if (!HANDLE.test(handle)) return null;
  switch (network) {
    case 'instagram': return `https://www.instagram.com/${handle}`;
    case 'tiktok': return `https://www.tiktok.com/@${handle}`;
    case 'facebook': return `https://www.facebook.com/${handle}`;
    case 'snapchat': return `https://www.snapchat.com/add/${handle}`;
    case 'youtube': return `https://www.youtube.com/@${handle}`;
  }
}
