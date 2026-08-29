// POST /api/artist/logout — efface le cookie de session artiste.

import { NextResponse } from 'next/server';
import { clearArtistSession } from '@/lib/artistAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  await clearArtistSession();
  return NextResponse.json({ ok: true });
}
