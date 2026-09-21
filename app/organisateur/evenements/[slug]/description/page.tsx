import type { Metadata } from 'next';
import DescriptionForm from '@/components/organizer/event/DescriptionForm';
import { emptyDetails, loadEventPage } from '@/lib/organizer/event-page-data';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Description · Espace organisateur', robots: { index: false, follow: false } };

export default async function DescriptionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data, title, legacyDresscode } = await loadEventPage(slug, `/organisateur/evenements/${slug}/description`);
  const d = { ...emptyDetails(), ...(data.details ?? {}) };
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Description</h1><p className="script">{title}</p>
      <DescriptionForm slug={slug} initial={d} legacyDresscode={legacyDresscode} media={data.media} />
    </main>
  );
}
