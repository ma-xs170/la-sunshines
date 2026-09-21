import type { Metadata } from 'next';
import InvitationForm from '@/components/organizer/event/InvitationForm';
import { type OrgTiers } from '@/lib/organizer/data';
import { orgEventRpc } from '@/lib/organizer/event-data';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Envoyer des invitations · Espace organisateur', robots: { index: false, follow: false } };

export default async function InvitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data, title } = await orgEventRpc<OrgTiers>(slug, `/organisateur/evenements/${slug}/invitations`, 'org_tiers');
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Envoyer des invitations</h1><p className="script">{title}</p>
      <InvitationForm slug={slug} tiers={data.tiers.filter((t) => !t.archived).map((t) => ({ id: t.id, name: t.name }))} />
    </main>
  );
}
