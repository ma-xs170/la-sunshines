// GET /api/artist/session — { slug: string | null } pour l'artiste connecté.
// Utilisé par la page publique pour afficher « Modifier ma page » plutôt que le
// lien « recevoir un lien de connexion », sans rendre la page dynamique.

import { NextResponse } from 'next/server';
import { getArtistSession } from '@/lib/artistAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const slug = await getArtistSession();
  return NextResponse.json(
    { slug },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
