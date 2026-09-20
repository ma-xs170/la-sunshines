// Actualités : catégories et nettoyage du texte. Fonctions PURES (testées), partagées entre les routes serveur et l'interface.
// Le contenu est du TEXTE SIMPLE : jamais de HTML. Les chevrons sont retirés à l'enregistrement (la base les refuse aussi) et
// l'affichage passe par React (échappement automatique) — jamais par dangerouslySetInnerHTML.

export type NewsCategory = 'nouveaute' | 'important' | 'maintenance';
export const NEWS_CATEGORIES: Record<NewsCategory, string> = { nouveaute: 'Nouveauté', important: 'Important', maintenance: 'Maintenance' };
export const isNewsCategory = (v: unknown): v is NewsCategory => typeof v === 'string' && v in NEWS_CATEGORIES;

export const TITLE_MAX = 120;
export const BODY_MAX = 5000;

/** Titre : une seule ligne, sans chevrons ni caractères de contrôle. */
export function cleanNewsTitle(s: string): string {
  return s.replace(/[<>\u0000-\u001F\u007F]/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, TITLE_MAX);
}

/** Contenu : texte simple, sauts de ligne conservés, sans chevrons ni caractères de contrôle. */
export function cleanNewsBody(s: string): string {
  return s.replace(/\r\n?/g, '\n').replace(/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, BODY_MAX);
}

/** Image facultative : URL https uniquement, sans espace ni guillemet ni chevron. Renvoie null si vide ou refusée. */
export function safeImageUrl(s: string | null | undefined): string | null {
  const v = (s ?? '').trim();
  if (!v) return null;
  if (v.length > 500 || !/^https:\/\/[^\s<>"']+$/.test(v)) return null;
  try { return new URL(v).protocol === 'https:' ? v : null; } catch { return null; }
}

/** Découpe le texte en paragraphes (lignes vides) ; les retours à la ligne simples restent dans le paragraphe. */
export const paragraphs = (body: string): string[] => body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
