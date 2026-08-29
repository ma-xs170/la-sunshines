import type { MetadataRoute } from 'next';
import { getAllEditions } from '@/lib/content';
import { getArtistProfiles } from '@/lib/artistProfiles';

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

export default function sitemap(): MetadataRoute.Sitemap {
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

  return [
    ...STATIC_ROUTES.map((r) => ({ url: `${BASE}${r}`, lastModified: now })),
    ...editions,
    ...artists,
  ];
}
