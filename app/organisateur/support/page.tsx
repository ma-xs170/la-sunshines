import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOrgContext } from '@/lib/organizer/context';
import { one } from '@/lib/organizer/event-data';
import { can } from '@/lib/organizer/roles';
import { CATEGORY_LABEL, PRIORITY_LABEL, statusText } from '@/lib/support';
import { supportRpc } from '@/lib/supportServer';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Historique du support · Espace organisateur', robots: { index: false, follow: false } };
interface Row { id: string; reference: string; subject: string; category: string; priority: string; status: string; updated_at: string; admin_name: string | null; unread: boolean }

export default async function SupportHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { s, current } = await getOrgContext();
  if (!s) redirect('/connexion?next=/organisateur/support');
  if (!s.hasAccess || !current || !can(current.my_role, 'manage')) redirect('/organisateur');
  const sp = await searchParams; const q = one(sp.q).slice(0, 80); const st = ['open', 'claimed', 'closed'].includes(one(sp.statut)) ? one(sp.statut) : '';
  const r = await supportRpc<Row[]>('support_list', { p_actor: s.userId, p_org: current.id, p_q: q || null, p_status: st || null });
  return (
    <main className="org org-page">
      <div className="org-head"><div><h1 className="org-head__title">Historique du support</h1><p className="script">{current.name}</p></div><Link className="btn btn--amber btn--lg" href="/organisateur/support/nouveau">Créer un ticket</Link></div>
      <form className="org-filters glass" method="get" role="search"><label className="sr-only" htmlFor="q">Rechercher</label><input id="q" className="org-search" name="q" defaultValue={q} placeholder="Objet ou référence TK." />
        <label className="sr-only" htmlFor="st">Statut</label><select id="st" name="statut" defaultValue={st}><option value="">Tous les statuts</option><option value="open">Ouvert</option><option value="claimed">Pris en charge</option><option value="closed">Fermé</option></select><button className="btn btn--amber">Filtrer</button></form>
      {!r.ok ? <p className="admin-error" role="alert">{r.message}</p> : r.data.length === 0 ? <div className="glass org-empty"><h3>Aucune conversation</h3><p>Un souci, une question ? Crée un ticket : l’équipe te répond ici.</p></div> : (
        <div className="org-table glass"><table><thead><tr><th>Ticket</th><th>Objet</th><th>Catégorie</th><th>Priorité</th><th>Statut</th><th>Mis à jour</th></tr></thead>
          <tbody>{r.data.map((t) => <tr key={t.id}><td data-label="Ticket"><Link href={`/organisateur/support/${t.id}`}><code>{t.reference}</code></Link>{t.unread && <b className="oside__badge" style={{ marginLeft: 6 }}>Nouveau</b>}</td><td data-label="Objet">{t.subject}</td><td data-label="Catégorie">{CATEGORY_LABEL[t.category]}</td><td data-label="Priorité">{PRIORITY_LABEL[t.priority]}</td>
            <td data-label="Statut">{statusText(t.status, t.admin_name)}</td><td data-label="Mis à jour">{new Date(t.updated_at).toLocaleString('fr-FR', { timeZone: 'America/Guadeloupe', dateStyle: 'short', timeStyle: 'short' })}</td></tr>)}</tbody></table></div>)}
    </main>
  );
}
