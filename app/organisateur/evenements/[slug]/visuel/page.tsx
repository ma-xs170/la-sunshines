import type { Metadata } from 'next';
import VisualUpload from '@/components/organizer/VisualUpload';
import { orgEventRpc } from '@/lib/organizer/event-data';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Visuel · Espace organisateur', robots: { index: false, follow: false } };

export default async function VisualPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { title } = await orgEventRpc(slug, `/organisateur/evenements/${slug}/visuel`, 'org_event_details');
  const { data } = await createSupabaseAdminClient().from('ticketed_events').select('event_details(flyer_url)').eq('event_slug', slug).maybeSingle();
  const d = data?.event_details as { flyer_url: string | null } | { flyer_url: string | null }[] | null | undefined;
  const url = (Array.isArray(d) ? d[0]?.flyer_url : d?.flyer_url) ?? null;
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Visuel de l’évènement</h1><p className="script">{title}</p>
      <VisualUpload slug={slug} current={url} title={title} />
    </main>
  );
}
