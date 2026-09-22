import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Icon from '@/components/Icon';
import EventBrowser from '@/components/organizer/EventBrowser';
import { loadCardEvents } from '@/lib/organizer/cards';
import { getOrgContext } from '@/lib/organizer/context';
import { can } from '@/lib/organizer/roles';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Mes évènements · Espace organisateur', robots: { index: false, follow: false } };

// Liste de TOUS les évènements de l'organisation courante (l'accueil n'en montre qu'un aperçu avec la checklist).
export default async function OrganizerEventsPage() {
  const { s, current } = await getOrgContext();
  if (!s) redirect('/connexion?next=/organisateur/evenements');
  if (!s.hasAccess || !current) redirect('/organisateur');
  const manage = can(current.my_role, 'manage');
  const { ok, events } = await loadCardEvents(s.userId, current.id, current.name);
  return (
    <main className="org org-home">
      <div className="org-head">
        <div>
          <h1 className="org-head__title">Mes évènements</h1>
          <p className="script">{current.name}</p>
        </div>
        {manage && <Link className="btn btn--amber btn--lg" href="/organisateur/evenements/nouveau"><Icon name="plus" />Créer un évènement</Link>}
      </div>
      {!ok && <p className="admin-error" role="alert">Impossible de charger les évènements pour l’instant.</p>}
      <EventBrowser events={events} canManage={manage} canCreate={manage} />
    </main>
  );
}
