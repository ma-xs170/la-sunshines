import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';
import { trackPageview } from '@/lib/pageviews';

// Compte les vues de pages publiques (Vercel KV). Exclut API, assets, /admin,
// et les préchargements du routeur Next (pour ne pas gonfler les compteurs).
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|admin|favicon.ico).*)'],
};

export function middleware(req: NextRequest, event: NextFetchEvent) {
  const isPrefetch =
    req.headers.get('next-router-prefetch') === '1' ||
    req.headers.get('purpose') === 'prefetch' ||
    req.headers.get('x-middleware-prefetch') === '1';

  const { pathname } = req.nextUrl;
  const isAsset = /\.[a-z0-9]+$/i.test(pathname); // .png, .svg, .xml, .txt…

  if (!isPrefetch && !isAsset) {
    event.waitUntil(trackPageview(pathname));
  }
  return NextResponse.next();
}
