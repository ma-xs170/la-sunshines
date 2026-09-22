import type { Metadata } from 'next';
import { adminRpc, requireAdminPage } from '@/lib/adminSpace';
import { one } from '@/lib/organizer/event-data';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Organisateurs · Gestion', robots: { index: false, follow: false } };
const STATUS: Record<string, string> = { pending: 'En attente', approved: 'Approuvé', suspended: 'Suspendu' };

export default async function OrganizersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireAdminPage('/admin/gestion/organisateurs');
  const sp = await searchParams; const q = one(sp.q).slice(0, 80); const st = Object.keys(STATUS).includes(one(sp.statut)) ? one(sp.statut) : '';
  const r = await adminRpc<{ id: string; reference: string | null; name: string; contact_email: string; account_status: string; created_at: string }[]>('admin_find_organizers', { p_actor: s.userId, p_q: q || null, p_status: st || null, p_limit: 50 });
  return (
    <>
      <h1 className="org-head__title">Organisateurs</h1>
      <form className="org-filters glass" method="get" role="search">
        <label className="sr-only" htmlFor="q">Rechercher</label><input id="q" className="org-search" name="q" defaultValue={q} placeholder="Référence, nom ou e-mail" />
        <label className="sr-only" htmlFor="st">Statut</label><select id="st" name="statut" defaultValue={st}><option value="">Tous les statuts</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <button className="btn btn--amber">Filtrer</button>
      </form>
      {!r.ok ? <p className="admin-error" role="alert">{r.message}</p> : r.data.length === 0 ? <div className="glass org-empty"><h3>Aucun organisateur</h3><p>Aucune organisation ne correspond à cette recherche.</p></div> : (
        <div className="org-table glass"><table><thead><tr><th>Référence</th><th>Structure</th><th>E-mail</th><th>Statut</th><th /></tr></thead>
          <tbody>{r.data.map((o) => <tr key={o.id}><td data-label="Référence"><code>{o.reference ?? '—'}</code></td><td data-label="Structure">{o.name}</td><td data-label="E-mail">{o.contact_email || '—'}</td><td data-label="Statut">{STATUS[o.account_status]}</td><td><Link className="btn btn--outline" href={`/admin/gestion/organisateurs/${o.id}`}>Voir</Link></td></tr>)}</tbody></table></div>)}
    </>
  );
}
