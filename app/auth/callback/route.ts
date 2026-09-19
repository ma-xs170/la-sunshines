import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/config';
import { safeNext } from '@/lib/auth/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Retour OAuth (Google) : échange du code contre une session.
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get('code');
  if (!supabaseConfigured() || !code) {
    return NextResponse.redirect(new URL('/connexion?erreur=lien', url));
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL('/connexion?erreur=lien', url));
  return NextResponse.redirect(new URL(safeNext(url.searchParams.get('next')), url));
}
