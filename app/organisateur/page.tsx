import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import Icon from '@/components/Icon';
import Checklist from '@/components/organizer/Checklist';
import NewsBanner from '@/components/organizer/NewsBanner';
import EventBrowser from '@/components/organizer/EventBrowser';
import type { CardEvent } from '@/lib/organizer/browse';
import { getOrgContext } from '@/lib/organizer/context';
import { newsFor } from '@/lib/organizer/news';
import { editorial, orgRpc, type OrgEventRow } from '@/lib/organizer/data';
import { can } from '@/lib/organizer/roles';
import { eventState } from '@/lib/organizer/status';
import { formatGp } from '@/lib/ticketing/time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Espace organisateur · LA SUNSHINES', robots: { index: false, follow: false } };

// Accueil « Bienvenue » de l'espace organisateur : réservé aux comptes admin ou membres d'une organisation.
// Chaque organisation ne voit QUE ses événements (l'organisation courante se choisit dans le menu en haut à droite).
export default async function OrganizerHome() {
  const { s, current } = await getOrgContext();
  if (!s) redirect('/connexion?next=/organisateur');

  if (!s.hasAccess || !current) {
    return (
      <>
        <Nav />
        <main className="org content-page">
          <PageHero eyebrow="Espace organisateur" title="Accès réservé" lead="Ton compte n’est rattaché à aucune organisation. Si tu organises des soirées avec LA SUNSHINES, contacte l’équipe pour être ajouté·e." />
          <a className="btn btn--outline" href="/contact">Nous contacter</a>
        </main>
        <Footer />
      </>
    );
  }

  const role = current.my_role;
  const manage = can(role, 'manage');
  const [r, news] = await Promise.all([orgRpc<OrgEventRow[]>('org_events', { p_actor: s.userId }), newsFor(s.userId)]);
  const rows = (r.ok ? r.data : []).filter((e) => e.organizer_id === current.id);
  const events: CardEvent[] = rows.map((e) => {
    const ed = editorial(e.slug);
    return {
      slug: e.slug, title: ed.title, startsAt: e.starts_at, dateLabel: formatGp(e.starts_at), venue: e.venue_name, state: eventState(e), archived: e.archived,
      sold: e.sold, reserved: e.reserved, capacity: e.capacity, entered: e.entered, revenueCents: e.revenue_cents, hasFlyer: Boolean(ed.flyer), organizerName: e.organizer_name,
    };
  });

  return (
    <main className="org org-home">
      <NewsBanner items={news ?? []} />
      <div className="org-head">
        <div>
          <h1 className="org-head__title">Bienvenue</h1>
          <p className="script">{s.firstName ? `Content de te revoir, ${s.firstName}.` : 'Content de te revoir.'}</p>
        </div>
        {manage && <a className="btn btn--amber btn--lg" href="/organisateur/evenements/nouveau"><Icon name="plus" />Créer un événement</a>}
      </div>

      {manage && <Checklist org={{ ...current, name: current.name, stripe_ready: current.stripe_ready }} editable={can(role, 'owner')} />}
      {!r.ok && <p className="admin-error" role="alert">Impossible de charger les événements pour l’instant.</p>}
      <EventBrowser events={events} canManage={manage} canCreate={manage} />
    </main>
  );
}
