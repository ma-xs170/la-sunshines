import type { Metadata } from 'next';
import VenuesPanel from '@/components/organizer/event/VenuesPanel';
import { loadEventPage } from '@/lib/organizer/event-page-data';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Lieux · Espace organisateur', robots: { index: false, follow: false } };

export default async function VenuesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data, title } = await loadEventPage(slug, `/organisateur/evenements/${slug}/lieux`);
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Lieux</h1><p className="script">{title}</p>
      <VenuesPanel org={data.event.organizer_id} initial={data.venues} />
    </main>
  );
}
