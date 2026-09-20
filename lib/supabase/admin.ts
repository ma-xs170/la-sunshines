// Client Supabase SERVICE ROLE : contourne la RLS. SERVEUR UNIQUEMENT.
//
// - Jamais importé depuis un composant client ni préfixé NEXT_PUBLIC_.
// - Réservé aux opérations sensibles (réservation de stock, webhook Stripe,
//   scan, remboursements…) APRÈS contrôle d'identité/rôle dans la route.

import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { supabaseUrl } from './config';

// Clé serveur : SUPABASE_SERVICE_ROLE_KEY (JWT « service_role ») ou, à défaut, SUPABASE_SECRET_KEY (nouveau format).
function serverKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
}

export function supabaseAdminConfigured(): boolean {
  return Boolean(supabaseUrl() && serverKey());
}

export function createSupabaseAdminClient() {
  const key = serverKey();
  if (!supabaseUrl() || !key) {
    throw new Error('Supabase service role non configurée.');
  }
  return createClient(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
