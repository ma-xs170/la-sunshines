import { NextResponse } from 'next/server';
import { adminConfigured, passwordMatches, grantSession } from '@/lib/adminAuth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!adminConfigured()) {
    return NextResponse.json(
      { error: 'ADMIN_PASSWORD non configuré côté serveur.' },
      { status: 503 },
    );
  }
  let password = '';
  try {
    ({ password = '' } = await req.json());
  } catch {
    /* corps invalide */
  }
  if (!passwordMatches(password)) {
    return NextResponse.json({ error: 'Mot de passe incorrect.' }, { status: 401 });
  }
  await grantSession();
  return NextResponse.json({ ok: true });
}
