import type { Metadata } from 'next';
import { FormsEditor, type Question } from '@/components/organizer/event/SimpleSections';
import { loadEventPage } from '@/lib/organizer/event-page-data';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Formulaires · Espace organisateur', robots: { index: false, follow: false } };

export default async function FormsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data, title } = await loadEventPage(slug, `/organisateur/evenements/${slug}/formulaires`);
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Formulaires</h1><p className="script">{title}</p>
      <FormsEditor slug={slug} initial={(data.details?.form_questions ?? []) as Question[]} guardian={data.details?.guardian_form ?? false} />
    </main>
  );
}
