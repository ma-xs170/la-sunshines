import type { Metadata } from 'next';
import { orgEventRpc } from '@/lib/organizer/event-data';
import { formatGp } from '@/lib/ticketing/time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Suivi des invitations · Espace organisateur', robots: { index: false, follow: false } };
interface Data { issued: number; used: number; rows: { order_number: string; created_at: string; email_status: string; tier: string; tickets: number; used: number }[] }

export default async function InviteTrackPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data, title } = await orgEventRpc<Data>(slug, `/organisateur/evenements/${slug}/invitations/suivi`, 'org_invitations');
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Suivi des invitations</h1><p className="script">{title}</p>
      <section className="org-kpis" aria-label="Chiffres clés"><div className="glass org-kpi"><span className="kicker">Remises</span><strong>{data.issued}</strong><span>billets d’invitation</span></div>
        <div className="glass org-kpi"><span className="kicker">Utilisées</span><strong>{data.used}</strong><span>entrées scannées</span></div></section>
      {data.rows.length === 0 ? <div className="glass org-empty"><h3>Aucune invitation</h3><p>Les invitations envoyées apparaîtront ici. Par respect de la vie privée, aucune coordonnée n’est affichée.</p></div> : (
        <div className="org-table glass"><table><thead><tr><th>Commande</th><th>Tarif</th><th>Billets</th><th>Utilisés</th><th>E-mail</th><th>Date</th></tr></thead>
          <tbody>{data.rows.map((r) => <tr key={r.order_number}><td data-label="Commande"><code>{r.order_number}</code></td><td data-label="Tarif">{r.tier}</td><td data-label="Billets">{r.tickets}</td><td data-label="Utilisés">{r.used}</td>
            <td data-label="E-mail">{r.email_status === 'sent' ? 'Remis' : r.email_status === 'failed' ? 'Échec' : 'En attente'}</td><td data-label="Date">{formatGp(r.created_at)}</td></tr>)}</tbody></table></div>)}
    </main>
  );
}
