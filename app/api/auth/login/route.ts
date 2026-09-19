import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/config';
import { loginSchema, safeNext } from '@/lib/auth/schemas';
import { fail, isOutage, parseBody, TOO_MANY, UNAVAILABLE } from '@/lib/auth/http';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!supabaseConfigured()) return fail(UNAVAILABLE, 503);

  const rl = await rateLimit(`login:${clientIp(req)}`, 10, 600);
  if (!rl.ok) return fail(TOO_MANY, 429);

  const parsed = await parseBody(req, loginSchema);
  if ('res' in parsed) return parsed.res;
  const { email, password, next } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Panne côté Supabase (réseau / 5xx) : ne pas la faire passer pour un mauvais mot de passe.
    if (isOutage(error)) return fail('Service momentanément indisponible. Réessaie dans un instant.', 503);
    if (error.code === 'email_not_confirmed') {
      return fail('Confirme ton adresse email (lien reçu par mail) avant de te connecter.', 403);
    }
    // Message volontairement identique : ne révèle pas si le compte existe.
    return fail('Email ou mot de passe incorrect.', 401);
  }
  return NextResponse.json({ ok: true, next: safeNext(next) });
}
