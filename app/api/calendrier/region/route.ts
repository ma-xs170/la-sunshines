import { NextResponse } from 'next/server';
import { isRegion } from '@/lib/calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?region=&next= — mémorise la région du calendrier (cookie) puis redirige ; `next` doit rester dans l'espace organisateur ou de gestion.
export function GET(req: Request) {
  const u = new URL(req.url); const region = u.searchParams.get('region'); const next = u.searchParams.get('next') ?? '';
  const to = /^\/(organisateur|admin\/gestion)\/calendrier$/.test(next) ? next : '/organisateur/calendrier';
  const res = NextResponse.redirect(new URL(to, req.url), 303);
  if (isRegion(region)) res.cookies.set('sun_region', region, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' });
  return res;
}
