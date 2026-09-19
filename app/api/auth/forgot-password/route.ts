import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/config';
import { forgotSchema } from '@/lib/auth/schemas';
import { fail, originOf, parseBody, TOO_MANY, UNAVAILABLE } from '@/lib/auth/http';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!supabaseConfigured()) return fail(UNAVAILABLE, 503);

  const rl = await rateLimit(`forgot:${clientIp(req)}`, 3, 3600, { failClosed: true });
  if (!rl.ok) return fail(TOO_MANY, 429);

  const parsed = await parseBody(req, forgotSchema);
  if ('res' in parsed) return parsed.res;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${originOf(req)}/auth/confirm`,
  });
  if (error?.status === 429) return fail(TOO_MANY, 429);
  if (error) console.error('[forgot-password] échec :', error.code, error.message);

  // Réponse identique que le compte existe ou non (anti-énumération).
  return NextResponse.json({ ok: true });
}
