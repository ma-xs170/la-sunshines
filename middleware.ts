import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';
import { trackPageview } from '@/lib/pageviews';
import { needsSessionRefresh, refreshSession } from '@/lib/supabase/middleware';

// Deux missions :
//  1. compter les vues de pages publiques (Vercel KV) — comportement d'origine,
//     inchangé : exclut /api, /admin, les assets et les préchargements Next ;
//  2. rafraîchir la session Supabase sur les routes comptes / billets /
//     checkout / scan (voir SESSION_PREFIXES dans lib/supabase/middleware.ts).
//
// Matcher : avant, il excluait /api et /admin. Le rafraîchissement de session
// doit s'exécuter sur /api/checkout, /admin/scan… donc le middleware passe
// désormais sur ces chemins aussi, mais n'y fait RIEN d'autre (ni comptage, ni
// réécriture) tant qu'ils ne sont pas dans la liste des préfixes de session.
// Seul /api/stripe/webhook est exclu : Stripe exige le corps brut, intact.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook).*)'],
};

export async function middleware(req: NextRequest, event: NextFetchEvent) {
  const isPrefetch =
    req.headers.get('next-router-prefetch') === '1' ||
    req.headers.get('purpose') === 'prefetch' ||
    req.headers.get('x-middleware-prefetch') === '1';

  const { pathname } = req.nextUrl;
  const isAsset = /\.[a-z0-9]+$/i.test(pathname); // .png, .svg, .xml, .txt…
  const isExcludedFromCount = /^\/(api|admin)/.test(pathname); // exclusion d'origine

  if (!isPrefetch && !isAsset && !isExcludedFromCount) {
    event.waitUntil(trackPageview(pathname));
  }

  if (!isPrefetch && needsSessionRefresh(req)) {
    return refreshSession(req);
  }
  return NextResponse.next();
}
