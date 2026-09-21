// Pages publiques d'organisateurs. INERTES tant que le mode public est « bizouk » (défaut) ou que Supabase n'est pas configuré : rien ne s'ouvre sans ton activation.
import 'server-only';
import { unstable_cache } from 'next/cache';
import { createSupabaseAdminClient, supabaseAdminConfigured } from '@/lib/supabase/admin';
import { TICKETING_CACHE_TAG } from '@/lib/supabase/public';
import { getTicketingSettings } from '@/lib/ticketing/settings';
import { linkedOrganizerIdOf, publicLinkedEditionsOf } from '@/lib/eventLinks';

export interface PublicOrganizer { name: string; slug: string; description: string; logo_url: string | null; banner_url: string | null; website: string; socials: Record<string, string>; events: { slug: string; starts_at: string; upcoming: boolean }[] }
export interface EventOrganizer { name: string; slug: string; logo_url: string | null }

async function open(): Promise<boolean> {
  if (!supabaseAdminConfigured()) return false;
  try { return (await getTicketingSettings()).mode !== 'bizouk'; } catch { return false; }
}
const loadPage = unstable_cache(async (slug: string) => {
  const db = createSupabaseAdminClient();
  const { data } = await db.rpc('public_organizer_page', { p_slug: slug });
  const page = (data ?? null) as PublicOrganizer | null;
  if (!page) return null;
  // + éditions rattachées à l'organisation (table event_links) : évènements passés et éditorial, y compris ceux vendus ailleurs (Bizouk)
  const { data: row } = await db.from('organizer_pages').select('organizer_id').eq('slug', slug).maybeSingle();
  if (row?.organizer_id) {
    const have = new Set(page.events.map((e) => e.slug));
    for (const e of await publicLinkedEditionsOf(row.organizer_id as string)) if (!have.has(e.slug)) page.events.push({ slug: e.slug, starts_at: e.dateISO ?? '', upcoming: !e.past });
  }
  return page;
}, ['public-organizer-page'], { revalidate: 60, tags: [TICKETING_CACHE_TAG] });
const loadBlock = unstable_cache(async (slug: string) => {
  const db = createSupabaseAdminClient();
  const { data } = await db.rpc('public_event_organizer', { p_event_slug: slug });
  if (data) return data as EventOrganizer;
  // édition rattachée par event_links (pas de billetterie interne) : même bloc « Organisé par »
  const orgId = await linkedOrganizerIdOf(slug);
  if (!orgId) return null;
  const { data: pg } = await db.from('organizer_pages').select('slug, logo_url, organizers!inner(name, account_status)').eq('organizer_id', orgId).eq('organizers.account_status', 'approved').maybeSingle();
  const o = pg ? (Array.isArray(pg.organizers) ? pg.organizers[0] : pg.organizers) as { name: string } | undefined : undefined;
  return pg && o ? { name: o.name, slug: pg.slug as string, logo_url: (pg.logo_url as string | null) ?? null } : null;
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
