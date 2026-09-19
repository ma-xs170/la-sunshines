// Client Supabase SERVEUR lié à la session de l'utilisateur (cookies) — soumis
// à la RLS. À utiliser dans les Server Components, pages et route handlers.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAnonKey, supabaseUrl } from './config';

export async function createSupabaseServerClient() {
  const jar = await cookies();
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          // Appelé depuis un Server Component (cookies en lecture seule) :
          // sans danger, le middleware rafraîchit la session.
        }
      },
    },
  });
}
