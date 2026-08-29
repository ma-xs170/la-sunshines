// PATCH /api/artist/profile — l'artiste connecté modifie SA fiche.
//
// SÉCURITÉ : distincte de /api/admin/*. Seule la session artiste (cookie
// sun_artist) est vérifiée — jamais la session admin. Le slug modifié vient
// EXCLUSIVEMENT de la session : impossible de toucher la fiche d'un autre
// artiste ou quoi que ce soit d'autre (événements, etc.).

import { NextResponse } from 'next/server';
import { readStore } from '@/lib/store';
import { persistStore } from '@/lib/persistStore';
import { applyArtistPatch } from '@/lib/adminRecords';
import { getArtistSession } from '@/lib/artistAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_IMG_CHARS = 3_600_000; // ~2,6 Mo d'image encodée en base64
const MAX_BIO = 2000;
const MAX_SOCIAL = 300;

function badImage(v: unknown): boolean {
  if (v === undefined) return false;
  if (typeof v !== 'string') return true;
  if (v === '') return false; // suppression (bannière)
  return !/^data:image\/(png|jpe?g|webp|gif|avif);base64,/i.test(v) || v.length > MAX_IMG_CHARS;
}

export async function PATCH(req: Request) {
  const slug = await getArtistSession();
  if (!slug) {
    return NextResponse.json({ error: 'Session artiste requise.' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'JSON invalide.' }, { status: 400 });
  }

  // liste blanche stricte des champs modifiables par l'artiste
  const bio = typeof body.bio === 'string' ? body.bio : undefined;
  const instagram = typeof body.instagram === 'string' ? body.instagram : undefined;
  const tiktok = typeof body.tiktok === 'string' ? body.tiktok : undefined;
  const soundcloud = typeof body.soundcloud === 'string' ? body.soundcloud : undefined;
  const email = typeof body.email === 'string' ? body.email : undefined;
  const image = body.image; // data URL ou undefined
  const banner = body.banner; // data URL, '' (suppression) ou undefined

  if (bio !== undefined && bio.length > MAX_BIO) {
    return NextResponse.json({ error: 'Bio trop longue (2000 caractères max).' }, { status: 400 });
  }
  for (const [k, v] of Object.entries({ instagram, tiktok, soundcloud })) {
    if (typeof v === 'string' && v.length > MAX_SOCIAL) {
      return NextResponse.json({ error: `Champ « ${k} » trop long.` }, { status: 400 });
    }
  }
  if (email !== undefined && email !== '' && !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Email invalide.' }, { status: 400 });
  }
  if (badImage(image)) {
    return NextResponse.json({ error: 'Photo invalide (image ≤ 2,5 Mo).' }, { status: 400 });
  }
  if (badImage(banner)) {
    return NextResponse.json({ error: 'Bannière invalide (image ≤ 2,5 Mo).' }, { status: 400 });
  }

  const store = await readStore();
  const idx = store.artists.findIndex((a) => a.slug === slug);
  if (idx < 0) {
    return NextResponse.json({ error: 'Fiche introuvable.' }, { status: 404 });
  }

  // applyArtistPatch ne touche NI le nom, NI le slug, NI `verified`, NI le rôle
  // quand ces clés sont absentes de l'input → l'artiste ne peut pas se
  // renommer, se dé-certifier, etc.
  store.artists[idx] = applyArtistPatch(store.artists[idx], {
    ...(bio !== undefined ? { bio } : {}),
    ...(instagram !== undefined ? { instagram } : {}),
    ...(tiktok !== undefined ? { tiktok } : {}),
    ...(soundcloud !== undefined ? { soundcloud } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(typeof image === 'string' ? { image } : {}),
    ...(typeof banner === 'string' ? { banner } : {}),
  });

  const saved = await persistStore(store);
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error }, { status: 502 });
  }
  return NextResponse.json({
    ok: true,
    item: store.artists[idx],
    deployed: saved.deployed,
  });
}
