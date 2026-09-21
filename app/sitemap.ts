import type { MetadataRoute } from 'next';
import { getAllEditions } from '@/lib/content';
import { getArtistProfiles } from '@/lib/artistProfiles';
import { listPublicOrganizerSlugs } from '@/lib/publicOrganizer';

const BASE = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://la-sunshines.vercel.app'
).replace(/\/$/, '');

const STATIC_ROUTES = [
  '/',
  '/editions',
  '/infos',
  '/interdits',
  '/contact',
  '/mentions-legales',
  '/politique-de-confidentialite',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // getAllEditions() exclut déjà les éditions masquées (hidden) → jamais
  // référencées dans le sitemap. /admin et /status sont noindex, hors sitemap.
  const editions = getAllEditions().map((e) => ({
    url: `${BASE}/editions/${e.slug}`,
    lastModified: now,
  }));

  const artists = getArtistProfiles().map((a) => ({
    url: `${BASE}/artistes/${a.slug}`,
    lastModified: now,
  }));

  const organizers = (await listPublicOrganizerSlugs()).map((slug) => ({ url: `${BASE}/organisateurs/${slug}`, lastModified: now }));

  return [
    ...STATIC_ROUTES.map((r) => ({ url: `${BASE}${r}`, lastModified: now })),
    ...editions,
    ...artists,
    ...organizers,
  ];
}
