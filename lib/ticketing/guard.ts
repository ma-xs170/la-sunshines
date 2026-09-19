// Garde commune des routes d'administration de la billetterie.
// Exige un compte Supabase de rôle ADMIN (le mot de passe /admin historique
// ne suffit pas), la service role configurée, et un slug d'événement connu.

import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { requireApiRole } from '@/lib/auth/roles';
import { supabaseAdminConfigured } from '@/lib/supabase/admin';
import { getAllEditions } from '@/lib/content';
import { TICKETING_CACHE_TAG } from '@/lib/supabase/public';
import { SLUG_RE } from './schemas';

export async function requireBilletterieAdmin(): Promise<
  { ok: true; actor: string } | { ok: false; res: NextResponse }
> {
  const guard = await requireApiRole('admin');
  if (!guard.ok) return guard;
  if (!supabaseAdminConfigured()) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquante.' }, { status: 503 }),
    };
  }
  return { ok: true, actor: guard.session.userId };
}

/** Le slug doit exister dans getAllEditions (éditions JSON ET statiques, masquées incluses). */
export function editionForSlug(slug: string) {
  if (!SLUG_RE.test(slug)) return null;
  return getAllEditions({ includeHidden: true }).find((e) => e.slug === slug) ?? null;
}

/** Après une modification : les pages publiques relisent la config (sans redéploiement). */
export function revalidateTicketing() {
  revalidateTag(TICKETING_CACHE_TAG);
  revalidatePath('/editions/[slug]', 'page');
}
