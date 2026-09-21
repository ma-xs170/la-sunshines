// Détails publics d'un évènement saisis par l'organisateur (dresscode par couleurs, vidéo du flyer, réseaux…).
// Renvoie null si Supabase n'est pas configuré (production actuelle) ou si l'évènement n'a rien de publiable : la fiche reste alors IDENTIQUE.
import 'server-only';
import { unstable_cache } from 'next/cache';
import { createSupabaseAdminClient, supabaseAdminConfigured } from '@/lib/supabase/admin';
import { TICKETING_CACHE_TAG } from '@/lib/supabase/public';
import { normalizeDresscode, type DresscodeValue } from '@/lib/dresscodeColors';

export interface PublicEventDetails {
  subtitle: string; description: string; dresscode: DresscodeValue; socials: Record<string, string>; contact_email: string;
  video: { hevc_url: string | null; h264_url: string | null; poster_url: string | null } | null;
}

const load = unstable_cache(async (slug: string): Promise<PublicEventDetails | null> => {
  const { data, error } = await createSupabaseAdminClient().rpc('public_event_details', { p_slug: slug });
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  return {
    subtitle: String(d.subtitle ?? ''), description: String(d.description ?? ''), dresscode: normalizeDresscode(d.dresscode),
    socials: (d.socials && typeof d.socials === 'object' ? d.socials : {}) as Record<string, string>, contact_email: String(d.contact_email ?? ''),
    video: d.video && typeof d.video === 'object' ? (d.video as PublicEventDetails['video']) : null,
  };
}, ['public-event-details'], { revalidate: 60, tags: [TICKETING_CACHE_TAG] });

export async function getPublicEventDetails(slug: string): Promise<PublicEventDetails | null> {
  if (!supabaseAdminConfigured()) return null;
  try { return await load(slug); } catch { return null; }
}
