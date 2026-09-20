// GET /api/artist/login?token=…  — clic sur le lien magique.
// Vérifie le jeton (usage unique, non expiré), le marque `used`, pose le cookie
// de session artiste puis redirige vers l'espace d'édition.

import { NextResponse } from 'next/server';
import { readStore } from '@/lib/store';
import { grantArtistSession } from '@/lib/artistAuth';
import { consumeArtistLoginToken } from '@/lib/privateData';
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

  // jeton à usage unique, consommé de façon atomique (Supabase) : un second clic est refusé
  const slug = await consumeArtistLoginToken(token);
  if (!slug) {
    return NextResponse.redirect(`${base}/artistes?login=expire`);
  }

  const store = await readStore();
  const artist = store.artists.find((a) => a.slug === slug);
  if (!artist || !artist.verified) {
    return NextResponse.redirect(`${base}/artistes?login=invalide`);
  }

  await grantArtistSession(artist.slug);
  return NextResponse.redirect(`${base}/artistes/${artist.slug}/modifier`);
}
