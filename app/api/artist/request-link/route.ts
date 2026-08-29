// POST /api/artist/request-link  — body { slug }
// Un artiste DÉJÀ vérifié redemande un lien de connexion. Réponse toujours
// générique (ne révèle pas si la page existe / est vérifiée / a un email).

import { NextResponse } from 'next/server';
import { readStore } from '@/lib/store';
import { persistStore } from '@/lib/persistStore';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { issueArtistLoginToken, sendArtistMagicLink } from '@/lib/artistLogin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GENERIC = {
  ok: true,
  message:
    'Si cette page est vérifiée, un lien de connexion vient d’être envoyé à l’adresse email de l’artiste.',
};

export async function POST(req: Request) {
  const rl = await rateLimit(`artist-link:${clientIp(req)}`, 5, 3600);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Trop de demandes. Réessaie plus tard.' },
      { status: 429 },
    );
  }

  let slug = '';
  try {
    ({ slug = '' } = (await req.json()) as { slug?: string });
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  slug = String(slug).trim();
  if (!slug) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });

  const store = await readStore();
  const artist = store.artists.find((a) => a.slug === slug);

  // conditions non révélées au client : on renvoie la même réponse quoi qu'il arrive
  if (artist && artist.verified && artist.email) {
    const token = issueArtistLoginToken(store, artist.slug);
    const saved = await persistStore(store);
    if (saved.ok) void sendArtistMagicLink(artist, token);
  }

  return NextResponse.json(GENERIC);
}
