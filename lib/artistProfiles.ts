// Profils artistes (/artistes/[slug]) — SERVEUR UNIQUEMENT (lit le FS via lib/store).
//
// Un « profil » = une fiche réellement créée dans /admin (data/content.json).
// Un nom d'artiste affiché sur le site n'est cliquable QUE s'il correspond à un
// profil existant (comparaison sur la forme canonique du nom).

import { cache } from 'react';
import { readStoreSync, type StoredArtist } from './store';
import { normalizeArtistName } from './artists';
import { getAllEditions } from './content';
import { isEditionUpcoming, type Edition } from './editions';

export type { StoredArtist };

/** Tous les profils artistes (normalisés). Mémoïsé par passe de rendu. */
export const getArtistProfiles = cache((): StoredArtist[] => readStoreSync().artists);

/** Index nom canonique -> profil. */
const profileIndex = cache((): Map<string, StoredArtist> => {
  const m = new Map<string, StoredArtist>();
  for (const a of getArtistProfiles()) {
    const key = normalizeArtistName(a.name);
    if (key && !m.has(key)) m.set(key, a);
  }
  return m;
});

/** Renvoie le profil correspondant à un nom affiché, ou `undefined`. */
export function findArtistProfile(name: string): StoredArtist | undefined {
  return profileIndex().get(normalizeArtistName(name));
}

export function getArtistBySlug(slug: string): StoredArtist | undefined {
  return getArtistProfiles().find((a) => a.slug === slug);
}

export type SocialKind = 'instagram' | 'tiktok' | 'soundcloud' | 'email';

const SOCIAL_BASE: Record<Exclude<SocialKind, 'email'>, string> = {
  instagram: 'https://instagram.com/',
  tiktok: 'https://tiktok.com/@',
  soundcloud: 'https://soundcloud.com/',
};

/** Transforme une valeur stockée (URL complète ou @pseudo) en href utilisable. */
export function socialHref(kind: SocialKind, raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (kind === 'email') {
    return v.startsWith('mailto:') ? v : `mailto:${v}`;
  }
  if (/^https?:\/\//i.test(v)) return v;
  return SOCIAL_BASE[kind] + v.replace(/^@+/, '');
}

/** Liste ordonnée des réseaux réellement renseignés pour un profil. */
export function artistSocials(
  a: StoredArtist,
): { kind: SocialKind; icon: 'instagram' | 'tiktok' | 'soundcloud' | 'mail'; label: string; href: string }[] {
  const defs: { kind: SocialKind; icon: 'instagram' | 'tiktok' | 'soundcloud' | 'mail'; label: string; value: string }[] = [
    { kind: 'instagram', icon: 'instagram', label: 'Instagram', value: a.instagram },
    { kind: 'tiktok', icon: 'tiktok', label: 'TikTok', value: a.tiktok },
    { kind: 'soundcloud', icon: 'soundcloud', label: 'SoundCloud', value: a.soundcloud },
    { kind: 'email', icon: 'mail', label: 'Email', value: a.email },
  ];
  return defs
    .map((d) => ({ ...d, href: socialHref(d.kind, d.value) }))
    .filter((d): d is typeof d & { href: string } => Boolean(d.href));
}

/** Noms d'artiste cités par une édition (headliner + line-up), forme canonique. */
function editionArtistKeys(ed: Edition): string[] {
  const names = [
    ...(ed.headliner ? ed.headliner.split(/\s*·\s*/) : []),
    ...ed.lineup,
  ];
  return names.map(normalizeArtistName).filter(Boolean);
}

/**
 * Éditions où l'artiste apparaît (headliner ou line-up), séparées à venir / passées.
 * Croisement automatique avec lib/editions.ts (+ éditions admin) — aucun lien manuel.
 */
export function editionsForArtist(artist: StoredArtist): {
  upcoming: Edition[];
  past: Edition[];
} {
  const target = normalizeArtistName(artist.name);
  const matches = getAllEditions().filter((ed) =>
    editionArtistKeys(ed).includes(target),
  );
  return {
    upcoming: matches.filter(isEditionUpcoming),
    past: matches.filter((e) => !isEditionUpcoming(e)),
  };
}
