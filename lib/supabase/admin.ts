// Client Supabase SERVICE ROLE : contourne la RLS. SERVEUR UNIQUEMENT.
//
// - Jamais importé depuis un composant client ni préfixé NEXT_PUBLIC_.
// - Réservé aux opérations sensibles (réservation de stock, webhook Stripe,
//   scan, remboursements…) APRÈS contrôle d'identité/rôle dans la route.

import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { supabaseUrl } from './config';

export function supabaseAdminConfigured(): boolean {
  return Boolean(supabaseUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createSupabaseAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl() || !key) {
    throw new Error('Supabase service role non configurée.');
  }
  return createClient(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
