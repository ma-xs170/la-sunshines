import { Suspense, type ReactNode } from 'react';
import OrgShell from '@/components/organizer/OrgShell';
import { getOrgContext } from '@/lib/organizer/context';
import { unreadNewsCount } from '@/lib/organizer/news';
import './../organizer-shell.css';

// Cadre de l'espace organisateur : menu latéral à deux contextes (compte / évènement) et en-tête avec la référence ORG.
// Les pages « accès refusé » gardent la navigation du site (aucune organisation → pas de cadre).
export default async function OrganizerLayout({ children }: { children: ReactNode }) {
  const { s, orgs, current } = await getOrgContext();
  if (!s || !s.hasAccess || !current) return <>{children}</>;
  const unread = await unreadNewsCount(s.userId);
  const shellOrgs = orgs.map((o) => ({ id: o.id, name: o.name, role: o.my_role, reference: o.reference ?? null, status: o.account_status ?? 'approved' }));
  return (
    <Suspense fallback={null}>
      <OrgShell orgs={shellOrgs} currentId={current.id} unread={unread} firstName={s.firstName}>{children}</OrgShell>
    </Suspense>
  );
}
