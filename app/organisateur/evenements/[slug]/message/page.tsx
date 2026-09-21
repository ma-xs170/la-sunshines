import type { Metadata } from 'next';
import MessageComposer, { type MessageRow } from '@/components/organizer/MessageComposer';
import { orgEventRpc } from '@/lib/organizer/event-data';
import { orgRpc, type OrgStats } from '@/lib/organizer/data';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Message aux participants · Espace organisateur', robots: { index: false, follow: false } };

export default async function MessagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const next = `/organisateur/evenements/${slug}/message`;
  const { s, data: stats, title } = await orgEventRpc<OrgStats>(slug, next, 'org_event_stats');
  const ml = await orgRpc<MessageRow[]>('org_messages_list', { p_actor: s.userId, p_slug: slug });
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Message aux participants</h1><p className="script">{title}</p>
      <p className="org-muted">Message d’information (horaires, accès, changement de dernière minute) envoyé par e-mail aux acheteurs. Pas de promotion ni de lien. 3 messages maximum par évènement et par 24 heures.</p>
      <MessageComposer slug={slug} tiers={stats.tiers.filter((t) => !t.archived || t.sold > 0).map((t) => ({ id: t.tier_id, name: t.name }))} selected={[]} history={ml.ok ? ml.data : []} replyTo={stats.organizer.contact_email} />
    </main>
  );
}
