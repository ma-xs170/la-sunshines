import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import EventBrowser, { type CardEvent } from '@/components/organizer/EventBrowser';
import { getOrgSession } from '@/lib/organizer/access';
import { editorial, orgRpc, type OrgEventRow } from '@/lib/organizer/data';
import { eventState, STATE_LABEL } from '@/lib/organizer/status';
import { formatGp } from '@/lib/ticketing/time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Espace organisateur · LA SUNSHINES', robots: { index: false, follow: false } };

// Espace organisateur : réservé aux comptes admin ou membres d'un organisateur. Chaque organisateur ne voit QUE ses événements.
export default async function OrganizerHome() {
  const s = await getOrgSession();
  if (!s) redirect('/connexion?next=/organisateur');

  if (!s.hasAccess) {
    return (
      <>
        <Nav />
        <main className="org content-page">
          <PageHero eyebrow="Espace organisateur" title="Accès réservé" lead="Ton compte n’est rattaché à aucun organisateur. Si tu organises des soirées avec LA SUNSHINES, contacte l’équipe pour être ajouté·e." />
          <a className="btn btn--outline" href="/contact">Nous contacter</a>
        </main>
        <Footer />
      </>
    );
  }

  const r = await orgRpc<OrgEventRow[]>('org_events', { p_actor: s.userId });
  const rows = r.ok ? r.data : [];
  const events: CardEvent[] = rows.map((e) => {
    const ed = editorial(e.slug);
    const state = eventState(e);
    return {
      slug: e.slug, title: ed.title, dateLabel: formatGp(e.starts_at), venue: e.venue_name, state, stateLabel: STATE_LABEL[state],
      sold: e.sold, reserved: e.reserved, capacity: e.capacity, entered: e.entered, hasFlyer: Boolean(ed.flyer), organizerName: e.organizer_name,
    };
  });
  const orgNames = [...new Set(rows.map((e) => e.organizer_name))];

  return (
    <>
      <Nav />
      <main className="org content-page">
        <PageHero
          eyebrow="Espace organisateur"
          title="Mes événements"
          lead={orgNames.length ? `${orgNames.join(' · ')} — ventes, participants et messages, en un coup d’œil.` : 'Ventes, participants et messages, en un coup d’œil.'}
        />
        {!r.ok && <p className="admin-error" role="alert">Impossible de charger les événements pour l’instant.</p>}
        <EventBrowser events={events} />
      </main>
      <Footer />
    </>
  );
}
