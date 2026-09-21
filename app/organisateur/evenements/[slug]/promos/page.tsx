import type { Metadata } from 'next';
import PromosPanel, { type Promo } from '@/components/organizer/event/PromosPanel';
import { type OrgTiers } from '@/lib/organizer/data';
import { orgEventRpc } from '@/lib/organizer/event-data';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Codes de réduction · Espace organisateur', robots: { index: false, follow: false } };

export default async function PromosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [{ data: promos, title }, { data: tiers }] = await Promise.all([
    orgEventRpc<Promo[]>(slug, `/organisateur/evenements/${slug}/promos`, 'org_promos'), orgEventRpc<OrgTiers>(slug, `/organisateur/evenements/${slug}/promos`, 'org_tiers')]);
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Codes de réduction</h1><p className="script">{title}</p>
      <PromosPanel slug={slug} initial={promos} tiers={tiers.tiers.filter((t) => !t.archived).map((t) => ({ id: t.id, name: t.name }))} />
    </main>
  );
}
