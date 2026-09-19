// Client Supabase NAVIGATEUR (clé anon, soumis à la RLS). Session stockée en
// cookies pour rester lisible par le serveur (@supabase/ssr).

import { createBrowserClient } from '@supabase/ssr';
import { supabaseAnonKey, supabaseUrl } from './config';

export function createSupabaseBrowserClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
