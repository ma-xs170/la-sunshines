import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/config';
import { confirmSchema, safeNext } from '@/lib/auth/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lien des emails (confirmation d'inscription, mot de passe oublié) au format
// token_hash : fonctionne même si le lien est ouvert sur un autre appareil que
// celui de l'inscription (contrairement au flux PKCE « code »).
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const bad = () => NextResponse.redirect(new URL('/connexion?erreur=lien', url));
  if (!supabaseConfigured()) return bad();

  const parsed = confirmSchema.safeParse({
    token_hash: url.searchParams.get('token_hash'),
    type: url.searchParams.get('type'),
  });
  if (!parsed.success) return bad();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp(parsed.data);
  if (error) return bad();

  const fallback = parsed.data.type === 'recovery' ? '/mot-de-passe/reinitialiser' : '/compte';
  return NextResponse.redirect(new URL(safeNext(url.searchParams.get('next'), fallback), url));
}
