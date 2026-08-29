// POST /api/admin/artist-login-link  — body { slug }
// L'admin (re)génère et envoie un lien magique de connexion à un artiste vérifié.
// Invalide l'éventuel jeton précédent non utilisé. Aucun mot de passe : le
// système reste 100 % « lien à usage unique ».

import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { readStore } from '@/lib/store';
import { persistStore } from '@/lib/persistStore';
import { issueArtistLoginToken, sendArtistMagicLink } from '@/lib/artistLogin';
import { mailConfigured } from '@/lib/mail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }

  let slug = '';
  try {
    ({ slug = '' } = (await req.json()) as { slug?: string });
  } catch {
    return NextResponse.json({ error: 'JSON invalide.' }, { status: 400 });
  }
  slug = String(slug).trim();

  const store = await readStore();
  const artist = store.artists.find((a) => a.slug === slug);
  if (!artist) {
    return NextResponse.json({ error: 'Artiste introuvable.' }, { status: 404 });
  }
  if (!artist.verified) {
    return NextResponse.json(
      { error: 'Cet artiste n’est pas vérifié.' },
      { status: 409 },
    );
  }
  if (!artist.email) {
    return NextResponse.json(
      { error: 'Aucune adresse email sur cette fiche — renseigne-la d’abord.' },
      { status: 409 },
    );
  }

  const token = issueArtistLoginToken(store, artist.slug);
  const saved = await persistStore(store);
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error }, { status: 502 });
  }

  const sent = await sendArtistMagicLink(artist, token);
  if (!sent && mailConfigured()) {
    return NextResponse.json(
      { error: 'Le jeton a été créé mais l’email n’est pas parti. Réessaie.' },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    email: artist.email,
    deployed: saved.deployed,
    // en dev sans Resend configuré : renvoyer l'URL pour tester à la main
    devLink: mailConfigured()
      ? undefined
      : `/api/artist/login?token=${encodeURIComponent(token)}`,
  });
}
