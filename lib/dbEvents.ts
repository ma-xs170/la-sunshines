// Évènements créés en ligne (organisateurs) ET publiés après validation admin : page publique /editions/<slug>.
// La fiche est construite depuis la base (fonction SQL public_db_event : évènement publié, public, organisation approuvée) et convertie en « édition »
// par le même mapping que les évènements de data/content.json. Le widget Bizouk est régénéré à partir du SEUL identifiant enregistré.
import 'server-only';
import { unstable_cache } from 'next/cache';
import type { Edition } from './editions';
import { storedEventToEdition } from './content';
import { bizoukSrc } from './bizoukEmbed';
import { createSupabaseAdminClient, supabaseAdminConfigured } from './supabase/admin';
import { TICKETING_CACHE_TAG } from './supabase/public';

interface DbEvent { slug: string; title: string; event_type: string; subtitle: string; description: string; starts_at: string; venue: string; city: string | null; flyer_url: string | null;
  dresscode: { colors?: { name?: string }[]; free?: boolean; note?: string } | null; mode: 'internal' | 'bizouk' | 'none'; bizouk_event_id: string | null; organizer: string }

const load = unstable_cache(async (slug: string) => {
  const { data } = await createSupabaseAdminClient().rpc('public_db_event', { p_slug: slug });
  return (data ?? null) as DbEvent | null;
}, ['public-db-event'], { revalidate: 60, tags: [TICKETING_CACHE_TAG] });

const HHMM = new Intl.DateTimeFormat('fr-FR', { timeZone: 'America/Guadeloupe', hour: '2-digit', minute: '2-digit' });

/** Édition publique construite depuis un évènement créé en ligne, ou null (introuvable, non publié, privé, organisation non approuvée). */
export async function getDbEdition(slug: string): Promise<Edition | null> {
  if (!/^[a-z0-9][a-z0-9-]{0,98}$/.test(slug) || !supabaseAdminConfigured()) return null;
  let e: DbEvent | null = null;
  try { e = await load(slug); } catch { return null; }
  if (!e) return null;
  const start = new Date(e.starts_at);
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Guadeloupe', year: 'numeric', month: '2-digit', day: '2-digit' }).format(start);
  const dress = e.dresscode?.free ? 'Dresscode libre' : (e.dresscode?.colors ?? []).map((c) => c.name).filter(Boolean).join(' · ') || e.dresscode?.note || '';
  const embed = e.mode === 'bizouk' && e.bizouk_event_id ? `<iframe src="${bizoukSrc(e.bizouk_event_id)}"></iframe>` : '';
  return storedEventToEdition({
    id: `db-${e.slug}`, slug: e.slug, name: e.title, date: day, time: HHMM.format(start).replace(':', 'h'), description: e.subtitle || e.description.slice(0, 220),
    venue: [e.venue, e.city].filter(Boolean).join(', '), dresscode: dress, headliner: '', lineup: [], bizoukEmbed: embed, flyer: e.flyer_url ?? '', flyerW: 0, flyerH: 0,
    dominantColor: null, palette: [], gradient: '', emoji: '', hidden: false, archived: false, schedule: [], createdAt: e.starts_at,
  });
}

/** Slugs des évènements créés en ligne et publiés (sitemap). */
export async function listDbEditionSlugs(): Promise<string[]> {
  if (!supabaseAdminConfigured()) return [];
  try {
    const { data } = await createSupabaseAdminClient().from('ticketed_events').select('event_slug, event_details!inner(visibility, title), organizers!inner(account_status)')
      .eq('status', 'published').eq('event_details.visibility', 'public').eq('organizers.account_status', 'approved').neq('event_details.title', '');
    return (data ?? []).map((r) => (r as { event_slug: string }).event_slug);
  } catch { return []; }
}
