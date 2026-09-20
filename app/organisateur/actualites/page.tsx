import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOrgContext } from '@/lib/organizer/context';
import { can } from '@/lib/organizer/roles';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Actualités · Espace organisateur', robots: { index: false, follow: false } };

export default async function Page() {
  const { s, current } = await getOrgContext();
  if (!s) redirect('/connexion?next=/organisateur/actualites');
  if (!s.hasAccess || !current || !can(current.my_role, 'scan')) redirect('/organisateur');
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Actualités</h1>
      <div className="glass org-empty"><p className="script">Bientôt</p><p>Les nouveautés du site.</p></div>
    </main>
  );
}
