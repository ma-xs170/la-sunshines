import type { Metadata } from 'next';
import { ORDER_STATUS, one, orgEventRpc } from '@/lib/organizer/event-data';
import { formatEuro, formatGp, formatPrice } from '@/lib/ticketing/time';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Commandes · Espace organisateur', robots: { index: false, follow: false } };
const SIZES = [20, 50, 100];

interface Row { id: string; order_number: string; status: string; source: string; buyer_first_name: string; buyer_last_name: string; buyer_email: string; total_cents: number; refunded_cents: number; created_at: string; tickets: number }

export default async function OrdersPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params; const sp = await searchParams;
  const q = one(sp.q).slice(0, 80); const statut = Object.keys(ORDER_STATUS).includes(one(sp.statut)) ? one(sp.statut) : '';
  const size = SIZES.includes(Number(one(sp.n))) ? Number(one(sp.n)) : 20; const page = Math.max(1, Number(one(sp.page)) || 1);
  const { data, title } = await orgEventRpc<{ total: number; rows: Row[] }>(slug, `/organisateur/evenements/${slug}/commandes`, 'org_orders', { p_q: q || null, p_status: statut || null, p_limit: size, p_offset: (page - 1) * size });
  const pages = Math.max(1, Math.ceil(data.total / size));
  const link = (o: Record<string, string | number>) => { const u = new URLSearchParams({ ...(q && { q }), ...(statut && { statut }), n: String(size), page: '1', ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)])) }); return `?${u}`; };
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Commandes</h1><p className="script">{title}</p>
      <form className="org-filters glass" method="get" role="search">
        <label className="sr-only" htmlFor="o-q">Rechercher</label>
        <input id="o-q" className="org-search" name="q" defaultValue={q} placeholder="Nom, e-mail ou numéro de commande" />
        <label className="sr-only" htmlFor="o-s">Statut</label>
        <select id="o-s" name="statut" defaultValue={statut}><option value="">Tous les statuts</option>{Object.entries(ORDER_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <label className="sr-only" htmlFor="o-n">Par page</label>
        <select id="o-n" name="n" defaultValue={size}>{SIZES.map((s) => <option key={s} value={s}>{s} par page</option>)}</select>
        <button className="btn btn--amber">Filtrer</button>
      </form>
      {data.rows.length === 0 ? <div className="glass org-empty"><h3>Aucune commande</h3><p>{q || statut ? 'Aucune commande ne correspond à ces filtres.' : 'Les commandes de cet évènement apparaîtront ici dès la première vente.'}</p></div> : (
        <div className="org-table glass"><table>
          <thead><tr><th>Commande</th><th>Acheteur</th><th>Billets</th><th>Total</th><th>Statut</th><th>Date</th></tr></thead>
          <tbody>{data.rows.map((r) => (
            <tr key={r.id}><td data-label="Commande"><Link href={`/organisateur/evenements/${slug}/commandes/${r.id}`}><code>{r.order_number}</code></Link>{r.source === 'manual' && <span className="org-muted"> · invitation</span>}</td>
              <td data-label="Acheteur">{r.buyer_first_name} {r.buyer_last_name}<br /><span className="org-muted">{r.buyer_email}</span></td>
              <td data-label="Billets">{r.tickets}</td><td data-label="Total">{formatPrice(r.total_cents)}{r.refunded_cents > 0 && <span className="org-muted"> (−{formatEuro(r.refunded_cents)})</span>}</td>
              <td data-label="Statut">{ORDER_STATUS[r.status] ?? r.status}</td><td data-label="Date">{formatGp(r.created_at)}</td></tr>))}</tbody>
        </table></div>)}
      <nav className="org-pager" aria-label="Pagination"><span className="org-muted">{data.total} commande{data.total > 1 ? 's' : ''} · page {page} / {pages}</span>
        {page > 1 && <Link className="btn btn--outline" href={link({ page: page - 1 })}>Précédente</Link>}{page < pages && <Link className="btn btn--outline" href={link({ page: page + 1 })}>Suivante</Link>}</nav>
    </main>
  );
}
