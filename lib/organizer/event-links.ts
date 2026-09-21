// Liens d'un évènement pour l'organisateur : page publique et aperçu privé. Fonctions PURES (testées).
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://la-sunshines.vercel.app').replace(/\/+$/, '');

export const publicPath = (slug: string) => `/editions/${slug}`;
export const previewPath = (slug: string) => `/organisateur/evenements/${slug}/apercu`;

export interface EventLinks {
  /** Adresse publique complète (active seulement quand l'évènement est publié et a une page). */
  publicUrl: string;
  previewUrl: string;
  /** Publié ET page publique existante : le bouton ouvre la page publique. Sinon, il ouvre l'aperçu privé. */
  live: boolean;
  /** Bouton « Voir l'évènement » : chemin à ouvrir dans un nouvel onglet. */
  viewHref: string;
  isPreview: boolean;
}

export function eventLinks(slug: string, published: boolean, hasPublicPage: boolean): EventLinks {
  const live = published && hasPublicPage;
  return { publicUrl: SITE_URL + publicPath(slug), previewUrl: SITE_URL + previewPath(slug), live, viewHref: live ? publicPath(slug) : previewPath(slug), isPreview: !live };
}
