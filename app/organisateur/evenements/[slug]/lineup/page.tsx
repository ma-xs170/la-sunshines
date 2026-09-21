import type { Metadata } from 'next';
import LineupEditor, { type LineupRow } from '@/components/organizer/event/LineupEditor';
import { orgEventRpc } from '@/lib/organizer/event-data';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Lineup · Espace organisateur', robots: { index: false, follow: false } };

export default async function LineupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data, title } = await orgEventRpc<LineupRow[]>(slug, `/organisateur/evenements/${slug}/lineup`, 'org_lineup');
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Lineup</h1><p className="script">{title}</p>
      <LineupEditor slug={slug} initial={data} />
    </main>
  );
}
