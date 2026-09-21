import type { Metadata } from 'next';
import { TermsEditor } from '@/components/organizer/event/SimpleSections';
import { loadEventPage } from '@/lib/organizer/event-page-data';
import { DEFAULT_TERMS } from '@/lib/rulesText';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Conditions générales · Espace organisateur', robots: { index: false, follow: false } };

export default async function TermsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data, title } = await loadEventPage(slug, `/organisateur/evenements/${slug}/conditions`);
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Conditions générales</h1><p className="script">{title}</p>
      <TermsEditor slug={slug} initial={data.details?.terms ?? ''} fallback={DEFAULT_TERMS} />
    </main>
  );
}
