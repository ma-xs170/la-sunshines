import { NextResponse, type NextRequest } from 'next/server';
import { adminConfigured, grantSession } from '@/lib/adminAuth';
import { requireAdminApi } from '@/lib/adminSpace';

// Un compte administrateur Supabase ACTIF ouvre le panneau « Contenu du site » sans ressaisir le mot de passe historique :
// on lui pose le même cookie que la connexion par mot de passe. Refusé à tout autre compte ; redirection limitée à /admin/contenu.
export async function GET(req: NextRequest) {
  const a = await requireAdminApi();
  if (!a.ok || !adminConfigured()) return NextResponse.redirect(new URL('/admin/contenu', req.url), 303);
  await grantSession();
  const next = req.nextUrl.searchParams.get('next') ?? '';
  const safe = /^\/admin\/contenu(\?[A-Za-z0-9=&_.-]*)?$/.test(next) ? next : '/admin/contenu';
  return NextResponse.redirect(new URL(safe, req.url), 303);
}
