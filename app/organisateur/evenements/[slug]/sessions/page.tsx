import type { Metadata } from 'next';
import SessionsPanel from '@/components/organizer/event/SessionsPanel';
import { loadEventPage } from '@/lib/organizer/event-page-data';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sessions · Espace organisateur', robots: { index: false, follow: false } };

export default async function SessionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data, title } = await loadEventPage(slug, `/organisateur/evenements/${slug}/sessions`);
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Sessions</h1><p className="script">{title}</p>
      <SessionsPanel slug={slug} venues={data.venues} initial={data.sessions} />
    </main>
  );
}
