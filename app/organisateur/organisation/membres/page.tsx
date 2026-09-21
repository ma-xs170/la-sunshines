import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import MembersPanel, { type Member } from '@/components/organizer/MembersPanel';
import { getOrgContext } from '@/lib/organizer/context';
import { orgRpc } from '@/lib/organizer/data';
import { can } from '@/lib/organizer/roles';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Membres et rôles · Espace organisateur', robots: { index: false, follow: false } };

export default async function MembersPage() {
  const { s, current } = await getOrgContext();
  if (!s) redirect('/connexion?next=/organisateur/organisation/membres');
  if (!s.hasAccess || !current || !can(current.my_role, 'owner')) redirect('/organisateur');
  const r = await orgRpc<Member[]>('org_members', { p_actor: s.userId, p_org: current.id });
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Membres et rôles</h1><p className="script">{current.name}</p>
      {r.ok ? <MembersPanel org={current.id} members={r.data} me={s.userId} /> : <p className="admin-error" role="alert">Impossible de charger les membres.</p>}
    </main>
  );
}
