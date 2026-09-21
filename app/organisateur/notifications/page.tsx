import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import NotificationsForm from '@/components/organizer/NotificationsForm';
import { getOrgContext } from '@/lib/organizer/context';
import { orgRpc } from '@/lib/organizer/data';
import { can } from '@/lib/organizer/roles';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Notifications · Espace organisateur', robots: { index: false, follow: false } };

export default async function NotificationsPage() {
  const { s, current } = await getOrgContext();
  if (!s) redirect('/connexion?next=/organisateur/notifications');
  if (!s.hasAccess || !current || !can(current.my_role, 'manage')) redirect('/organisateur');
  const r = await orgRpc<Record<string, boolean>>('org_notif_get', { p_actor: s.userId, p_org: current.id });
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Notifications</h1><p className="script">{current.name}</p>
      <NotificationsForm org={current.id} initial={r.ok ? r.data : {}} editable={current.my_role !== 'admin'} />
    </main>
  );
}
