import type { ReactNode } from 'react';
import OrgTopbar from '@/components/organizer/OrgTopbar';
import { getOrgContext } from '@/lib/organizer/context';

// Cadre de l'espace organisateur : barre du haut propre à l'espace (les pages « accès refusé » gardent la navigation du site).
export default async function OrganizerLayout({ children }: { children: ReactNode }) {
  const { s, orgs, current } = await getOrgContext();
  if (!s || !s.hasAccess || !current) return <>{children}</>;
  return (
    <>
      <OrgTopbar
        orgs={orgs.map((o) => ({ id: o.id, name: o.name, role: o.my_role }))}
        currentId={current.id}
        unread={0}
        firstName={s.firstName}
      />
      {children}
    </>
  );
}
