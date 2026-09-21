import type { Metadata } from 'next';
import { adminRpc, requireAdminPage } from '@/lib/adminSpace';
import { one } from '@/lib/organizer/event-data';
import { fold } from '@/lib/dresscodeColors';
import { getAllEditions } from '@/lib/content';
import { formatGp } from '@/lib/ticketing/time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Évènements · Gestion', robots: { index: false, follow: false } };
const ST: Record<string, string> = { draft: 'Brouillon', published: 'Publié', closed: 'Terminé', cancelled: 'Annulé' };

export default async function AllEventsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireAdminPage('/admin/gestion/evenements');
  const sp = await searchParams; const st = Object.keys(ST).includes(one(sp.statut)) ? one(sp.statut) : ''; const q = fold(one(sp.q).slice(0, 80));
  const r = await adminRpc<{ slug: string; status: string; starts_at: string; organizer: string; organizer_reference: string | null; organizer_id: string; capacity: number; sold: number }[]>('admin_all_events', { p_actor: s.userId, p_status: st || null });
  const names = new Map(getAllEditions({ includeHidden: true }).map((e) => [e.slug, e.name]));
  const rows = (r.ok ? r.data : []).filter((e) => !q || fold(`${e.slug} ${names.get(e.slug) ?? ''} ${e.organizer}`).includes(q));
  return (
    <>
      <h1 className="org-head__title">Tous les évènements</h1>
      <form className="org-filters glass" method="get" role="search"><label className="sr-only" htmlFor="q">Rechercher</label><input id="q" className="org-search" name="q" defaultValue={one(sp.q)} placeholder="Nom, identifiant ou organisateur" />
        <label className="sr-only" htmlFor="st">Statut</label><select id="st" name="statut" defaultValue={st}><option value="">Tous les statuts</option>{Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><button className="btn btn--amber">Filtrer</button></form>
      {rows.length === 0 ? <div className="glass org-empty"><h3>Aucun évènement</h3><p>Aucun évènement de billetterie ne correspond à ces filtres.</p></div> : (
        <div className="org-table glass"><table><thead><tr><th>Évènement</th><th>Date</th><th>Organisateur</th><th>Statut</th><th>Vendus</th><th /></tr></thead>
          <tbody>{rows.map((e) => <tr key={e.slug}><td data-label="Évènement">{names.get(e.slug) ?? e.slug}<br /><span className="org-muted">{e.slug}</span></td><td data-label="Date">{formatGp(e.starts_at)}</td>
            <td data-label="Organisateur"><a href={`/admin/gestion/organisateurs/${e.organizer_id}`}>{e.organizer}</a><br /><code>{e.organizer_reference ?? ''}</code></td><td data-label="Statut">{ST[e.status]}</td><td data-label="Vendus">{e.sold} / {e.capacity}</td>
            <td><a className="btn btn--outline" href={`/admin/gestion/transfert?slug=${e.slug}`}>Transférer</a></td></tr>)}</tbody></table></div>)}
    </>
  );
}
