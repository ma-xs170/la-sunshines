import type { Metadata } from 'next';
import TicketingModePanel from '@/components/organizer/TicketingModePanel';
import { orgEventRpc } from '@/lib/organizer/event-data';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { TicketingMode } from '@/lib/organizer/create-event';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Billetterie · Espace organisateur', robots: { index: false, follow: false } };

// Méthode de billetterie de l'évènement. L'accès (gestionnaire de l'organisation ou admin) est revérifié par org_event_details ; le réglage global « mode public » reste l'interrupteur de sécurité.
export default async function TicketingModePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { title, data } = await orgEventRpc<{ event: { status: string } }>(slug, `/organisateur/evenements/${slug}/billetterie`, 'org_event_details');
  const db = createSupabaseAdminClient();
  const { data: ev } = await db.from('ticketed_events').select('id, ticketing_mode, bizouk_event_id, ticketing_enabled').eq('event_slug', slug).maybeSingle();
  const { count } = ev ? await db.from('orders').select('id', { count: 'exact', head: true }).eq('ticketed_event_id', ev.id).in('status', ['paid', 'partially_refunded']) : { count: 0 };
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Méthode de billetterie</h1><p className="script">{title}</p>
      <TicketingModePanel slug={slug} mode={((ev?.ticketing_mode as TicketingMode) ?? 'internal')} bizoukId={(ev?.bizouk_event_id as string | null) ?? null} locked={data.event.status === 'published' && (count ?? 0) > 0 && ev?.ticketing_mode === 'internal'} />
    </main>
  );
}
