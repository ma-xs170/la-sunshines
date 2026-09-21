// Rafraîchissement de session Supabase pour le middleware (@supabase/ssr).
// Renouvelle le jeton d'accès expiré et réécrit les cookies dans la réponse.
// NE décide d'aucun accès : chaque page / route contrôle elle-même l'identité
// et le rôle (getUser(), jamais getSession(), côté serveur).

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAnonKey, supabaseConfigured, supabaseUrl } from './config';

/** Préfixes où la session est rafraîchie (comptes, billets, checkout, scan). */
const SESSION_PREFIXES = [
  '/compte',
  '/connexion',
  '/inscription',
  '/mot-de-passe',
  '/auth',
  '/commande',
  '/admin',
  '/organisateur',
  '/api/auth',
  '/api/account',
  '/api/checkout',
  '/api/billetterie',
  '/api/organisateur',
  '/api/admin/news',
  '/api/scan',
  '/api/tickets',
];

export function needsSessionRefresh(req: NextRequest): boolean {
  if (!supabaseConfigured()) return false;
  const { pathname } = req.nextUrl;
  if (!SESSION_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return false;
  }
  // Visiteur sans cookie de session Supabase : rien à rafraîchir (0 appel réseau).
  return req.cookies.getAll().some((c) => c.name.startsWith('sb-'));
}

export async function refreshSession(req: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request: req });
  try {
    const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll(list) {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          response = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });
    await supabase.auth.getUser();
  } catch (e) {
    // Un souci Supabase ne doit jamais rendre le site inaccessible.
    console.error('[middleware] rafraîchissement de session impossible :', e);
  }
  return response;
}
