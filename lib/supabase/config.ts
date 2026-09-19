// Configuration Supabase. Les clés PUBLIQUES (URL + anon) sont lisibles côté
// client ; la service role key, elle, ne l'est jamais (voir lib/supabase/admin.ts).
//
// Tant que les variables ne sont pas définies, TOUTE la couche comptes est
// inerte : pas d'erreur, pas de menu compte, le site reste tel qu'avant.

export function supabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
}

export function supabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
}

export function supabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}

/** Bouton « Continuer avec Google » : à activer seulement une fois le provider configuré. */
export function googleAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GOOGLE_AUTH === '1';
}
