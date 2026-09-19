// Jointure « événement éditorial (getAllEditions) + configuration billetterie
// (ticketed_events) », clé = slug. LECTURE PUBLIQUE uniquement (RLS anon).

import { getEditionBySlug } from '@/lib/content';
import type { Edition } from '@/lib/editions';
import { createSupabasePublicClient } from '@/lib/supabase/public';
import { getTicketingSettings, type TicketingSettings } from './settings';

export type SaleState = 'on_sale' | 'upcoming' | 'sold_out' | 'closed';

export interface PublicTier {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  maxPerOrder: number;
  remaining: number;
  state: SaleState;
  salesStart: string | null;
}

export interface PublicTicketing {
  slug: string;
  startsAt: string;
  venueName: string;
  venueAddress: string;
  tiers: PublicTier[];
  settings: TicketingSettings;
}

/**
 * Billetterie NATIVE d'un événement, ou null → la page garde Bizouk.
 * Non nul seulement si : mode global = 'native' ET ticketing_enabled ET statut
 * publié ET au moins un tarif actif. Toute erreur → null (fail-safe).
 */
export async function getPublicTicketing(slug: string): Promise<PublicTicketing | null> {
  const supabase = createSupabasePublicClient(false);
  if (!supabase) return null;
  try {
    const settings = await getTicketingSettings(false);
    if (settings.mode !== 'native') return null;

    const { data: ev } = await supabase
      .from('ticketed_events')
      .select('id, starts_at, venue_name, venue_address, status, ticketing_enabled')
      .eq('event_slug', slug)
      .maybeSingle();
    if (!ev || !ev.ticketing_enabled || ev.status !== 'published') return null;

    const [{ data: tiers }, { data: avail }] = await Promise.all([
      supabase
        .from('ticket_tiers')
        .select('id, name, description, price_cents, max_per_order, sales_start, sort_order, created_at')
        .eq('ticketed_event_id', ev.id)
        .order('sort_order')
        .order('created_at'),
      supabase.rpc('get_availability', { p_slug: slug }),
    ]);
    if (!tiers || tiers.length === 0) return null;

    type Avail = { tier_id: string; remaining: number; state: SaleState };
    const byId = new Map<string, Avail>(((avail ?? []) as Avail[]).map((a) => [a.tier_id, a]));
    return {
      slug,
      startsAt: ev.starts_at,
      venueName: ev.venue_name,
      venueAddress: ev.venue_address,
      settings,
      tiers: tiers.map((t) => {
        const a = byId.get(t.id);
        return {
          id: t.id,
          name: t.name,
          description: t.description,
          priceCents: t.price_cents,
          maxPerOrder: t.max_per_order,
          remaining: a?.remaining ?? 0,
          state: a?.state ?? 'closed',
          salesStart: t.sales_start,
        };
      }),
    };
  } catch (e) {
    console.error('[ticketing] lecture publique impossible, repli sur Bizouk :', e);
    return null;
  }
}

/** Édition éditoriale + billetterie native (si active). */
export async function getEditionWithTicketing(
  slug: string,
): Promise<{ edition: Edition; ticketing: PublicTicketing | null } | null> {
  const edition = getEditionBySlug(slug);
  if (!edition) return null;
  return { edition, ticketing: await getPublicTicketing(slug) };
}
