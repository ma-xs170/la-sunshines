import type { Metadata } from 'next';
import ParticipantsSection from '@/components/organizer/ParticipantsSection';
import { orgEventRpc } from '@/lib/organizer/event-data';
import { type OrgStats } from '@/lib/organizer/data';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Renvoyer les billets · Espace organisateur', robots: { index: false, follow: false } };

export default async function ResendPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { s, data: stats, title } = await orgEventRpc<OrgStats>(slug, `/organisateur/evenements/${slug}/renvoi`, 'org_event_stats');
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Renvoyer les billets</h1><p className="script">{title}</p>
      <p className="org-muted">Retrouve un participant (nom, e-mail, référence) puis renvoie son billet PDF par e-mail. Un billet ne peut être renvoyé qu’une fois par minute ; chaque renvoi est journalisé.</p>
      <ParticipantsSection slug={slug} sp={sp} userId={s.userId} manage tiers={stats.tiers} replyTo={stats.organizer.contact_email} title="Billets" />
    </main>
  );
}
