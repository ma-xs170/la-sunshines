import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import Icon from '@/components/Icon';
import Checklist from '@/components/organizer/Checklist';
import NewsBanner from '@/components/organizer/NewsBanner';
import EventBrowser from '@/components/organizer/EventBrowser';
import { loadCardEvents } from '@/lib/organizer/cards';
import { getOrgContext } from '@/lib/organizer/context';
import { newsFor } from '@/lib/organizer/news';
import { can } from '@/lib/organizer/roles';

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
  const [list, news] = await Promise.all([loadCardEvents(s.userId, current.id), newsFor(s.userId)]);
  const events = list.events;

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
      {!list.ok && <p className="admin-error" role="alert">Impossible de charger les événements pour l’instant.</p>}
      <EventBrowser events={events} canManage={manage} canCreate={manage} />
    </main>
  );
}
