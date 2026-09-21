// Cartes d'évènements de l'organisation courante (accueil et page « Mes évènements »).
import 'server-only';
import type { CardEvent } from './browse';
import { editorial, orgRpc, type OrgEventRow } from './data';
import { eventState } from './status';
import { formatGp } from '@/lib/ticketing/time';

/** Évènements de l'organisation `orgId` uniquement (org_events applique déjà le rôle en SQL ; on filtre en plus sur l'organisation choisie). */
export async function loadCardEvents(userId: string, orgId: string): Promise<{ ok: boolean; events: CardEvent[] }> {
  const r = await orgRpc<OrgEventRow[]>('org_events', { p_actor: userId });
  const rows = (r.ok ? r.data : []).filter((e) => e.organizer_id === orgId);
  const events: CardEvent[] = rows.map((e) => {
    const ed = editorial(e.slug);
    return {
      slug: e.slug, title: ed.title, startsAt: e.starts_at, dateLabel: formatGp(e.starts_at), venue: e.venue_name, state: eventState(e), archived: e.archived,
      sold: e.sold, reserved: e.reserved, capacity: e.capacity, entered: e.entered, revenueCents: e.revenue_cents, hasFlyer: Boolean(ed.flyer), organizerName: e.organizer_name,
    };
  });
  return { ok: r.ok, events };
}
