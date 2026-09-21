// Pages publiques d'organisateurs. INERTES tant que le mode public est « bizouk » (défaut) ou que Supabase n'est pas configuré : rien ne s'ouvre sans ton activation.
import 'server-only';
import { unstable_cache } from 'next/cache';
import { createSupabaseAdminClient, supabaseAdminConfigured } from '@/lib/supabase/admin';
import { TICKETING_CACHE_TAG } from '@/lib/supabase/public';
import { getTicketingSettings } from '@/lib/ticketing/settings';

export interface PublicOrganizer { name: string; slug: string; description: string; logo_url: string | null; banner_url: string | null; website: string; socials: Record<string, string>; events: { slug: string; starts_at: string; upcoming: boolean }[] }
export interface EventOrganizer { name: string; slug: string; logo_url: string | null }

async function open(): Promise<boolean> {
  if (!supabaseAdminConfigured()) return false;
  try { return (await getTicketingSettings()).mode !== 'bizouk'; } catch { return false; }
}
const loadPage = unstable_cache(async (slug: string) => {
  const { data } = await createSupabaseAdminClient().rpc('public_organizer_page', { p_slug: slug });
  return (data ?? null) as PublicOrganizer | null;
}, ['public-organizer-page'], { revalidate: 60, tags: [TICKETING_CACHE_TAG] });
const loadBlock = unstable_cache(async (slug: string) => {
  const { data } = await createSupabaseAdminClient().rpc('public_event_organizer', { p_event_slug: slug });
  return (data ?? null) as EventOrganizer | null;
}, ['public-event-organizer'], { revalidate: 60, tags: [TICKETING_CACHE_TAG] });

export async function getPublicOrganizer(slug: string): Promise<PublicOrganizer | null> {
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug) || !(await open())) return null;
  try { return await loadPage(slug); } catch { return null; }
}
export async function getEventOrganizer(eventSlug: string): Promise<EventOrganizer | null> {
  if (!(await open())) return null;
  try { return await loadBlock(eventSlug); } catch { return null; }
}
/** Slugs des pages publiques (sitemap) : uniquement si le mode public est ouvert. */
export async function listPublicOrganizerSlugs(): Promise<string[]> {
  if (!(await open())) return [];
  try { const { data } = await createSupabaseAdminClient().from('organizer_pages').select('slug, organizers!inner(account_status)').eq('organizers.account_status', 'approved'); return (data ?? []).map((r) => (r as { slug: string }).slug); } catch { return []; }
}
