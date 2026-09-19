import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/config';
import { signupSchema, safeNext } from '@/lib/auth/schemas';
import { fail, isOutage, originOf, parseBody, TOO_MANY, UNAVAILABLE } from '@/lib/auth/http';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!supabaseConfigured()) return fail(UNAVAILABLE, 503);

  const rl = await rateLimit(`signup:${clientIp(req)}`, 5, 3600, { failClosed: true });
  if (!rl.ok) return fail(TOO_MANY, 429);

  // Honeypot : un bot remplit le champ caché → on fait semblant que tout va bien.
  const peek = await req.clone().json().catch(() => null);
  if (peek && typeof peek.website === 'string' && peek.website.trim() !== '') {
    return NextResponse.json({ ok: true, needsConfirmation: true });
  }

  const parsed = await parseBody(req, signupSchema);
  if ('res' in parsed) return parsed.res;
  const { email, password, first_name, last_name, phone, next } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { first_name, last_name, phone },
      // Le lien du mail (gabarit token_hash) pointe ici, puis renvoie vers `next`.
      emailRedirectTo: `${originOf(req)}/auth/confirm`,
    },
  });

  if (error) {
    if (isOutage(error)) return fail('Service momentanément indisponible. Réessaie dans un instant.', 503);
    if (error.code === 'weak_password') {
      return fail('Mot de passe trop faible. Choisis-en un plus long ou plus varié.');
    }
    if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
      return fail(TOO_MANY, 429);
    }
    console.error('[signup] échec :', error.code, error.message);
    return fail('Inscription impossible pour le moment. Réessaie plus tard.', 400);
  }

  // Anti-énumération : si l'email existe déjà, Supabase renvoie un succès factice.
  // Session immédiate seulement si la confirmation d'email est désactivée.
  return NextResponse.json({
    ok: true,
    needsConfirmation: !data.session,
    next: safeNext(next),
  });
}
