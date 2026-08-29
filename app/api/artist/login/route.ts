// GET /api/artist/login?token=…  — clic sur le lien magique.
// Vérifie le jeton (usage unique, non expiré), le marque `used`, pose le cookie
// de session artiste puis redirige vers l'espace d'édition.

import { NextResponse } from 'next/server';
import { readStore } from '@/lib/store';
import { persistStore } from '@/lib/persistStore';
import { grantArtistSession } from '@/lib/artistAuth';
import { findValidLoginToken } from '@/lib/artistLogin';
import { siteUrl } from '@/lib/mail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  const base = siteUrl();

  if (!token) {
    return NextResponse.redirect(`${base}/artistes?login=invalide`);
  }

  const store = await readStore();
  const entry = findValidLoginToken(store, token);
  if (!entry) {
    return NextResponse.redirect(`${base}/artistes?login=expire`);
  }

  const artist = store.artists.find((a) => a.slug === entry.artistSlug);
  if (!artist || !artist.verified) {
    return NextResponse.redirect(`${base}/artistes?login=invalide`);
  }

  // brûle le jeton
  store.artistLoginTokens = store.artistLoginTokens.map((t) =>
    t.token === token ? { ...t, used: true } : t,
  );
  await persistStore(store);

  await grantArtistSession(artist.slug);
  return NextResponse.redirect(`${base}/artistes/${artist.slug}/modifier`);
}
