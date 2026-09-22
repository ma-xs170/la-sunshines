import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/adminSpace';
import { one } from '@/lib/organizer/event-data';
import { CATEGORIES, CATEGORY_LABEL, PRIORITY_LABEL, statusText } from '@/lib/support';
import { supportRpc } from '@/lib/supportServer';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Support · Gestion', robots: { index: false, follow: false } };
interface Data { counts: Record<string, number>; rows: { id: string; reference: string; subject: string; category: string; priority: string; status: string; updated_at: string; organizer: string; organizer_reference: string | null; admin_name: string | null }[] }
const PRIO_CLASS: Record<string, string> = { urgent: 'ef-pill ef-pill--failed', high: 'ef-pill ef-pill--processing', medium: 'ef-pill', low: 'ef-pill' };

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireAdminPage('/admin/gestion/support');
  const sp = await searchParams; const cat = CATEGORIES.some(([k]) => k === one(sp.categorie)) ? one(sp.categorie) : ''; const scope = ['mine', 'closed'].includes(one(sp.vue)) ? one(sp.vue) : 'all';
  const r = await supportRpc<Data>('admin_support_list', { p_actor: s.userId, p_category: cat || null, p_scope: scope });
  const tabs: [string, string, string, string][] = [['', 'Tous', '', 'all'], ...CATEGORIES.map(([k, v]) => [k, v, '', k] as [string, string, string, string])];
  return (
    <>
      <h1 className="org-head__title">Support · organisateurs</h1>
      <div className="org-subnav" role="navigation" aria-label="Catégories">
        {tabs.map(([k, v, , c]) => <Link key={k} href={k ? `?categorie=${k}` : '?'} className={'org-subnav__link' + (!scope || scope === 'all' ? (cat === k ? ' is-active' : '') : '')}>{v}{r.ok && r.data.counts[c] > 0 && <b className="oside__badge" style={{ marginLeft: 6 }}>{r.data.counts[c]}</b>}</Link>)}
        <Link href="?vue=mine" className={'org-subnav__link' + (scope === 'mine' ? ' is-active' : '')}>Mes tickets{r.ok && r.data.counts.mine > 0 && <b className="oside__badge" style={{ marginLeft: 6 }}>{r.data.counts.mine}</b>}</Link>
        <Link href="?vue=closed" className={'org-subnav__link' + (scope === 'closed' ? ' is-active' : '')}>Fermés</Link>
      </div>
      {!r.ok ? <p className="admin-error" role="alert">{r.message}</p> : r.data.rows.length === 0 ? <div className="glass org-empty"><h3>Aucun ticket</h3><p>Rien à traiter dans cette vue.</p></div> : (
        <div className="org-table glass"><table><thead><tr><th>Ticket</th><th>Organisateur</th><th>Objet</th><th>Priorité</th><th>Statut</th></tr></thead>
          <tbody>{r.data.rows.map((t) => <tr key={t.id}><td data-label="Ticket"><Link href={`/admin/gestion/support/${t.id}`}><code>{t.reference}</code></Link><br /><span className="org-muted">{CATEGORY_LABEL[t.category]}</span></td>
            <td data-label="Organisateur">{t.organizer}<br /><code>{t.organizer_reference}</code></td><td data-label="Objet">{t.subject}</td><td data-label="Priorité"><span className={PRIO_CLASS[t.priority]}>{PRIORITY_LABEL[t.priority]}</span></td><td data-label="Statut">{statusText(t.status, t.admin_name)}</td></tr>)}</tbody></table></div>)}
    </>
  );
}
