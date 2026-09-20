// Invalidation IMMÉDIATE du site public après une écriture (admin ou organisateur).
// Les `revalidate = 60` des pages ne sont plus qu'un filet de sécurité : la modification apparaît tout de suite.
import 'server-only';
import { revalidatePath, revalidateTag } from 'next/cache';
import { TICKETING_CACHE_TAG } from '@/lib/supabase/public';

export function revalidatePublicSite() {
  try {
    revalidateTag(TICKETING_CACHE_TAG);
    revalidatePath('/', 'layout');   // accueil, éditions, fiches évènement, artistes, pages légales, sitemap
  } catch {
    /* hors requête (script, test) : rien à invalider */
  }
}
