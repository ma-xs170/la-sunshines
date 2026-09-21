import type { Metadata } from 'next';
import { orgEventRpc } from '@/lib/organizer/event-data';
import { formatEuro } from '@/lib/ticketing/time';
import type { Finance } from '../page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Versements · Espace organisateur', robots: { index: false, follow: false } };

export default async function PayoutsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: f, title } = await orgEventRpc<Finance>(slug, `/organisateur/evenements/${slug}/finance/versements`, 'org_finance');
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Versements</h1><p className="script">{title}</p>
      {f.payouts.length === 0 ? <div className="glass org-empty"><h3>Aucun versement pour l’instant</h3><p>Les virements faits par l’équipe LA SUNSHINES apparaîtront ici avec leur date. Reste à verser : {formatEuro(f.remaining_cents)}.</p></div> : (
        <div className="org-table glass"><table><thead><tr><th>Date</th><th>Montant</th><th>Note</th></tr></thead>
          <tbody>{f.payouts.map((p, i) => <tr key={i}><td data-label="Date">{new Date(p.paid_on).toLocaleDateString('fr-FR')}</td><td data-label="Montant">{formatEuro(p.amount_cents)}</td><td data-label="Note">{p.note || '—'}</td></tr>)}</tbody></table></div>)}
    </main>
  );
}
