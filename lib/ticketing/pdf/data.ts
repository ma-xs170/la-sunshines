// Chargement des données d'un billet PDF (service role, APRÈS contrôle d'accès par la route appelante). SERVEUR UNIQUEMENT.

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { flyerJpeg } from './assets';

export interface OrganizerBlock {
  name: string;
  legalForm: string;
  siret: string;
  responsible: string;
  address: string;
  contactEmail: string;
}

export interface TicketPageData {
  ticketId: string;
  reference: string;
  code: string;
  status: string;
  ownerId: string | null;
  holder: string;
  orderNumber: string;
  eventTitle: string;
  startsAt: string;
  venueName: string;
  venueAddress: string;
  tierName: string;
  priceCents: number;
  organizer: OrganizerBlock;
  flyer: { data: Buffer; width: number; height: number } | null;
}

interface Row {
  id: string; reference: string; code: string; status: string; user_id: string | null;
  holder_first_name: string; holder_last_name: string;
  orders: { order_number: string; user_id: string | null } | null;
  order_items: { tier_name: string; unit_price_cents: number; event_title: string; event_starts_at: string; venue_name: string; venue_address: string } | null;
  ticketed_events: {
    event_slug: string;
    organizers: { name: string; legal_form: string; siret: string; responsible_name: string; address: string; contact_email: string } | null;
  } | null;
}

const SELECT = `id, reference, code, status, user_id, holder_first_name, holder_last_name,
  orders(order_number, user_id),
  order_items(tier_name, unit_price_cents, event_title, event_starts_at, venue_name, venue_address),
  ticketed_events(event_slug, organizers(name, legal_form, siret, responsible_name, address, contact_email))`;

/** Un billet (ticketId) ou tous les billets d'une commande (orderId), dans l'ordre de création. */
export async function loadTicketPages(db: SupabaseClient, by: { ticketId: string } | { orderId: string }): Promise<TicketPageData[]> {
  const q = db.from('tickets').select(SELECT).order('created_at').order('id');
  const { data, error } = await ('ticketId' in by ? q.eq('id', by.ticketId) : q.eq('order_id', by.orderId));
  if (error || !data) return [];
  const rows = data as unknown as Row[];
  const flyers = new Map<string, Awaited<ReturnType<typeof flyerJpeg>>>();
  const pages: TicketPageData[] = [];
  for (const r of rows) {
    const slug = r.ticketed_events?.event_slug ?? '';
    if (!flyers.has(slug)) flyers.set(slug, slug ? await flyerJpeg(slug) : null);
    const o = r.ticketed_events?.organizers;
    pages.push({
      ticketId: r.id,
      reference: r.reference,
      code: r.code,
      status: r.status,
      ownerId: r.user_id ?? r.orders?.user_id ?? null,
      holder: `${r.holder_first_name} ${r.holder_last_name}`.trim(),
      orderNumber: r.orders?.order_number ?? '',
      eventTitle: r.order_items?.event_title ?? '',
      startsAt: r.order_items?.event_starts_at ?? '',
      venueName: r.order_items?.venue_name ?? '',
      venueAddress: r.order_items?.venue_address ?? '',
      tierName: r.order_items?.tier_name ?? '',
      priceCents: r.order_items?.unit_price_cents ?? 0,
      organizer: {
        name: o?.name ?? '',
        legalForm: o?.legal_form ?? '',
        siret: o?.siret ?? '',
        responsible: o?.responsible_name ?? '',
        address: o?.address ?? '',
        contactEmail: o?.contact_email ?? '',
      },
      flyer: flyers.get(slug) ?? null,
    });
  }
  return pages;
}
