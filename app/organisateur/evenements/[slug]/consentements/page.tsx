import type { Metadata } from 'next';
import { ConsentsEditor, type Consent } from '@/components/organizer/event/SimpleSections';
import { loadEventPage } from '@/lib/organizer/event-page-data';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Consentements RGPD · Espace organisateur', robots: { index: false, follow: false } };

export default async function ConsentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data, title } = await loadEventPage(slug, `/organisateur/evenements/${slug}/consentements`);
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Consentements RGPD</h1><p className="script">{title}</p>
      <ConsentsEditor slug={slug} initial={(data.details?.consents ?? []) as Consent[]} />
    </main>
  );
}
