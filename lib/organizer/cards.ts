// Cartes d'évènements de l'organisation courante (accueil et page « Mes évènements »).
import 'server-only';
import type { CardEvent } from './browse';
import { editorial, orgRpc, type OrgEventRow } from './data';
import { eventState } from './status';
import { formatGp } from '@/lib/ticketing/time';
import { linkedEditionsOf } from '@/lib/eventLinks';

/** Évènements de l'organisation `orgId` uniquement (org_events applique déjà le rôle en SQL ; on filtre en plus sur l'organisation choisie). */
export async function loadCardEvents(userId: string, orgId: string, orgName = ''): Promise<{ ok: boolean; events: CardEvent[] }> {
  const r = await orgRpc<OrgEventRow[]>('org_events', { p_actor: userId });
  const rows = (r.ok ? r.data : []).filter((e) => e.organizer_id === orgId);
  const events: CardEvent[] = rows.map((e) => {
    const ed = editorial(e.slug);
    return {
      slug: e.slug, title: ed.title, startsAt: e.starts_at, dateLabel: formatGp(e.starts_at), venue: e.venue_name, state: eventState(e), archived: e.archived,
      sold: e.sold, reserved: e.reserved, capacity: e.capacity, entered: e.entered, revenueCents: e.revenue_cents, hasFlyer: Boolean(ed.flyer), organizerName: e.organizer_name,
    };
  });
  // + évènements rattachés par event_links (éditions du site, passés, test) : fiche éditoriale seulement, aucun chiffre de billetterie inventé
  const have = new Set(events.map((e) => e.slug));
  for (const l of await linkedEditionsOf(orgId)) {
    if (have.has(l.slug)) { const c = events.find((e) => e.slug === l.slug); if (c && l.isTest) c.isTest = true; continue; }
    events.push({
      slug: l.slug, title: l.name, startsAt: l.dateISO ? `${l.dateISO}T12:00:00-04:00` : '2099-12-31T00:00:00Z', dateLabel: l.dateLabel, venue: l.venue,
      state: l.hidden ? 'draft' : l.past ? 'ended' : 'on_sale', archived: l.archived, sold: 0, reserved: 0, capacity: 0, entered: 0, revenueCents: null,
      hasFlyer: Boolean(l.flyer), flyerSrc: l.flyer ?? undefined, organizerName: orgName || rows[0]?.organizer_name || '', external: true, isTest: l.isTest,
    });
  }
  return { ok: r.ok, events };
}
