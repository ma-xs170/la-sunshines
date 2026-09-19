import type { Metadata } from 'next';
import { BilletterieShell } from '@/lib/ticketing/admin-page';
import { createSupabaseAdminClient, supabaseAdminConfigured } from '@/lib/supabase/admin';
import { getAllEditions } from '@/lib/content';
import InvitationForm from '@/components/ticketing/admin/InvitationForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Invitations · Billetterie', robots: { index: false, follow: false } };

export default async function InvitationsPage() {
  const names = new Map(getAllEditions({ includeHidden: true }).map((e) => [e.slug, e.name]));
  let events: { slug: string; name: string }[] = [];
  if (supabaseAdminConfigured()) {
    const { data } = await createSupabaseAdminClient().from('ticketed_events').select('event_slug').order('starts_at', { ascending: false });
    events = (data ?? []).map((e) => ({ slug: e.event_slug as string, name: names.get(e.event_slug) ?? e.event_slug }));
  }
  return (
    <BilletterieShell title="Invitations" next="/admin/billetterie/invitations">
      {events.length === 0 ? <p className="admin-hint">Configure d’abord la billetterie d’un événement.</p> : <InvitationForm events={events} />}
    </BilletterieShell>
  );
}
