import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import PublicPageForm, { type PageData } from '@/components/organizer/PublicPageForm';
import { getOrgContext } from '@/lib/organizer/context';
import { orgRpc } from '@/lib/organizer/data';
import { can } from '@/lib/organizer/roles';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Page publique · Espace organisateur', robots: { index: false, follow: false } };

export default async function PublicPageEditor() {
  const { s, current } = await getOrgContext();
  if (!s) redirect('/connexion?next=/organisateur/organisation/page-publique');
  if (!s.hasAccess || !current || !can(current.my_role, 'manage')) redirect('/organisateur');
  const r = await orgRpc<PageData | null>('org_page_get', { p_actor: s.userId, p_org: current.id });
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Page publique</h1><p className="script">{current.name}</p>
      {r.ok && r.data ? <PublicPageForm org={current.id} name={current.name} initial={r.data} isOpen={false} /> : <div className="glass org-empty"><h3>Page créée à l’approbation</h3><p>Ta page publique et ta référence {current.reference ?? 'ORG'} sont créées dès que l’équipe LA SUNSHINES approuve ton compte.</p></div>}
    </main>
  );
}
