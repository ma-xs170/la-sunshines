// Client Supabase PUBLIC : clé anon, AUCUNE session (pas de cookies) → utilisable
// dans les pages statiques / ISR sans les rendre dynamiques. Soumis à la RLS :
// il ne voit que ce que le public a le droit de voir.

import { createClient } from '@supabase/supabase-js';
import { supabaseAnonKey, supabaseConfigured, supabaseUrl } from './config';

export const TICKETING_CACHE_TAG = 'ticketing';

/**
 * @param live true = aucune mise en cache (route de disponibilité) ;
 *             false = cache ISR 60 s, invalidable par revalidateTag('ticketing').
 */
export function createSupabasePublicClient(live = false) {
  if (!supabaseConfigured()) return null;
  return createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(
          input,
          live
            ? { ...init, cache: 'no-store' }
            : { ...init, next: { revalidate: 60, tags: [TICKETING_CACHE_TAG] } },
        ),
    },
  });
}
