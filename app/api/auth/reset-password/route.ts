import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/config';
import { resetSchema } from '@/lib/auth/schemas';
import { fail, parseBody, TOO_MANY, UNAVAILABLE } from '@/lib/auth/http';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!supabaseConfigured()) return fail(UNAVAILABLE, 503);

  const rl = await rateLimit(`reset:${clientIp(req)}`, 10, 3600);
  if (!rl.ok) return fail(TOO_MANY, 429);

  const parsed = await parseBody(req, resetSchema);
  if ('res' in parsed) return parsed.res;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return fail('Ce lien a expiré. Refais une demande de réinitialisation.', 401);
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === 'weak_password') {
      return fail('Mot de passe trop faible. Choisis-en un plus long ou plus varié.');
    }
    if (error.code === 'same_password') {
      return fail('Choisis un mot de passe différent de l’ancien.');
    }
    console.error('[reset-password] échec :', error.code, error.message);
    return fail('Impossible de changer le mot de passe pour le moment.', 400);
  }
  return NextResponse.json({ ok: true });
}
