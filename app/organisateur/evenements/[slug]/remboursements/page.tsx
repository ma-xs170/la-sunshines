import type { Metadata } from 'next';
import { REFUND_STATUS, one, orgEventRpc } from '@/lib/organizer/event-data';
import { formatEuro, formatGp } from '@/lib/ticketing/time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Remboursements · Espace organisateur', robots: { index: false, follow: false } };
interface Row { id: string; order_id: string; order_number: string; buyer: string; amount_cents: number; reason: string | null; status: string; created_at: string; stripe_refund_id: string | null }

export default async function RefundsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params; const statut = one((await searchParams).statut);
  const f = Object.keys(REFUND_STATUS).includes(statut) ? statut : '';
  const { data, title } = await orgEventRpc<Row[]>(slug, `/organisateur/evenements/${slug}/remboursements`, 'org_refunds', { p_status: f || null });
  const tabs: [string, string][] = [['', 'Toutes'], ...Object.entries(REFUND_STATUS)];
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Remboursements</h1><p className="script">{title}</p>
      <div className="org-subnav" role="navigation" aria-label="Statut">{tabs.map(([k, v]) => <a key={k} href={k ? `?statut=${k}` : '?'} className={'org-subnav__link' + (f === k ? ' is-active' : '')} aria-current={f === k ? 'page' : undefined}>{v}</a>)}</div>
      {data.length === 0 ? <div className="glass org-empty"><h3>Aucun remboursement</h3><p>Les remboursements traités par l’équipe LA SUNSHINES pour cet évènement apparaîtront ici, avec leur motif.</p></div> : (
        <div className="org-table glass"><table><thead><tr><th>Commande</th><th>Acheteur</th><th>Montant</th><th>Statut</th><th>Motif</th><th>Date</th></tr></thead>
          <tbody>{data.map((r) => <tr key={r.id}><td data-label="Commande"><a href={`/organisateur/evenements/${slug}/commandes/${r.order_id}`}><code>{r.order_number}</code></a></td><td data-label="Acheteur">{r.buyer}</td>
            <td data-label="Montant">{formatEuro(r.amount_cents)}</td><td data-label="Statut">{REFUND_STATUS[r.status] ?? r.status}</td><td data-label="Motif">{r.reason || '—'}</td><td data-label="Date">{formatGp(r.created_at)}</td></tr>)}</tbody></table></div>)}
      <p className="org-muted">Les remboursements sont déclenchés par l’équipe LA SUNSHINES (l’argent passe par Stripe) : demande-le depuis le Support en indiquant le numéro de commande.</p>
    </main>
  );
}
