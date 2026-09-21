import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient, supabaseAdminConfigured } from '@/lib/supabase/admin';
import { getSession } from '@/lib/auth/roles';
import { fail, parseBody, TOO_MANY } from '@/lib/auth/http';
import { clientIp, rateLimit } from '@/lib/rateLimit';
import { passwordProblem } from '@/lib/adminPassword';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { password } — changement de mot de passe d'un utilisateur CONNECTÉ (obligatoire à la première connexion d'un admin). Le mot de passe n'est ni loggé ni renvoyé.
export async function POST(req: Request) {
  const rl = await rateLimit(`chpw:${clientIp(req)}`, 10, 600);
  if (!rl.ok) return fail(TOO_MANY, 429);
  const s = await getSession();
  if (!s) return fail('Connexion requise.', 401);
  const parsed = await parseBody(req, z.object({ password: z.string().max(200) }));
  if ('res' in parsed) return parsed.res;
  const problem = passwordProblem(parsed.data.password);
  if (problem) return fail(problem, 400);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail('Changement impossible. Choisis un autre mot de passe.', 400);
  if (supabaseAdminConfigured()) await createSupabaseAdminClient().rpc('admin_password_changed', { p_user: s.userId });
  return NextResponse.json({ ok: true });
}
