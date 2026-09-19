import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/auth/roles';
import { profileSchema } from '@/lib/auth/schemas';
import { fail, parseBody } from '@/lib/auth/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Mise à jour de SON profil. Passe par le client « utilisateur » : c'est la RLS
// (+ le droit de colonne) qui garantit qu'on ne touche ni au rôle ni au profil d'autrui.
export async function PATCH(req: Request) {
  const guard = await requireApiRole('customer');
  if (!guard.ok) return guard.res;

  const parsed = await parseBody(req, profileSchema);
  if ('res' in parsed) return parsed.res;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('profiles')
    .update(parsed.data)
    .eq('id', guard.session.userId)
    .select('first_name, last_name, phone')
    .single();

  if (error) {
    console.error('[profile] échec :', error.code, error.message);
    return fail('Enregistrement impossible. Réessaie.', 400);
  }
  return NextResponse.json({ ok: true, profile: data });
}
