import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import EventWizard from '@/components/organizer/EventWizard';
import { getOrgContext } from '@/lib/organizer/context';
import { orgRpc, type OrgEventRow } from '@/lib/organizer/data';
import { can } from '@/lib/organizer/roles';
import type { OrgCard } from '@/lib/organizer/create-event';
import { mistralConfigured } from '@/lib/flyerAI';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Créer un évènement · Espace organisateur', robots: { index: false, follow: false } };

// Création d'évènement en 3 étapes (organisation → billetterie → informations). Le serveur revérifie chaque choix à l'envoi.
export default async function NewEvent() {
  const { s, orgs, current } = await getOrgContext();
  if (!s) redirect('/connexion?next=/organisateur/evenements/nouveau');
  if (!s.hasAccess) redirect('/organisateur');
  const ev = await orgRpc<OrgEventRow[]>('org_events', { p_actor: s.userId });
  const counts = new Map<string, number>();
  for (const e of ev.ok ? ev.data : []) counts.set(e.organizer_id, (counts.get(e.organizer_id) ?? 0) + 1);
  // seules les organisations où l'on peut GÉRER (propriétaire, gestionnaire, admin) sont proposées ; le staff n'en voit aucune
  const cards: OrgCard[] = orgs.filter((o) => can(o.my_role, 'manage')).map((o) => ({ id: o.id, name: o.name, reference: o.reference, siret: o.siret || null, status: o.account_status, events: counts.get(o.id) ?? 0 }));
  return (
    <main className="org org-page">
      <p className="org__back"><a href="/organisateur/evenements">← Mes évènements</a></p>
      <h1 className="org-head__title">Créer un évènement</h1>
      <p className="script">On monte la prochaine soirée ensemble.</p>
      <EventWizard orgs={s.isAdmin ? cards.slice(0, 50) : cards} isAdmin={s.isAdmin} aiAvailable={mistralConfigured()} defaultOrg={current?.id ?? null} />
    </main>
  );
}
