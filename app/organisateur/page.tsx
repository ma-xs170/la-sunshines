import type { Metadata } from 'next';
import { forbidden, redirect } from 'next/navigation';
import Icon from '@/components/Icon';
import Checklist from '@/components/organizer/Checklist';
import NewsBanner from '@/components/organizer/NewsBanner';
import EventBrowser from '@/components/organizer/EventBrowser';
import { loadCardEvents } from '@/lib/organizer/cards';
import { getOrgContext } from '@/lib/organizer/context';
import { newsFor } from '@/lib/organizer/news';
import { can } from '@/lib/organizer/roles';
import { orgRpc } from '@/lib/organizer/data';
import { variation } from '@/lib/organizer/variation';
import { formatEuro } from '@/lib/ticketing/time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Espace organisateur · LA SUNSHINES', robots: { index: false, follow: false } };

// Accueil « Bienvenue » de l'espace organisateur : réservé aux comptes admin ou membres d'une organisation.
// Chaque organisation ne voit QUE ses événements (l'organisation courante se choisit dans le menu en haut à droite).
export default async function OrganizerHome() {
  const { s, current } = await getOrgContext();
  if (!s) redirect('/connexion?next=/organisateur');

  if (!s.hasAccess || !current) forbidden();

  const role = current.my_role;
  const manage = can(role, 'manage');
  const [list, news] = await Promise.all([loadCardEvents(s.userId, current.id), newsFor(s.userId)]);
  const events = list.events;
  const dash = manage ? await orgRpc<{ today_cents: number; yesterday_cents: number; month_cents: number; prev_month_cents: number; active_events: number }>('org_dashboard', { p_actor: s.userId, p_org: current.id }) : null;

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

      {dash?.ok && (
        <section className="org-kpis" aria-label="Ventes">
          <div className="glass org-kpi"><span className="kicker">Ventes aujourd’hui</span><strong>{formatEuro(dash.data.today_cents)}</strong><span>{variation(dash.data.today_cents, dash.data.yesterday_cents).text} vs hier</span></div>
          <div className="glass org-kpi"><span className="kicker">Ventes hier</span><strong>{formatEuro(dash.data.yesterday_cents)}</strong><span>recette nette</span></div>
          <div className="glass org-kpi"><span className="kicker">Ventes ce mois</span><strong>{formatEuro(dash.data.month_cents)}</strong><span>{variation(dash.data.month_cents, dash.data.prev_month_cents).text} vs mois dernier</span></div>
          <div className="glass org-kpi"><span className="kicker">Évènements actifs</span><strong>{dash.data.active_events}</strong><span>publiés et à venir</span></div>
        </section>
      )}
      {manage && <Checklist org={{ ...current, name: current.name, stripe_ready: current.stripe_ready }} editable={can(role, 'owner')} />}
      {!list.ok && <p className="admin-error" role="alert">Impossible de charger les événements pour l’instant.</p>}
      <EventBrowser events={events} canManage={manage} canCreate={manage} />
    </main>
  );
}
