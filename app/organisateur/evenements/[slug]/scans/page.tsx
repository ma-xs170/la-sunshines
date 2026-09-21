import type { Metadata } from 'next';
import LiveRefresh from '@/components/organizer/LiveRefresh';
import ProgressBar from '@/components/organizer/ProgressBar';
import { orgEventRpc } from '@/lib/organizer/event-data';
import { formatGp } from '@/lib/ticketing/time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Historique des scans · Espace organisateur', robots: { index: false, follow: false } };
interface Data { entered: number; expected: number; rows: { reference: string; holder_first_name: string; holder_last_name: string; used_at: string; tier: string; agent: string | null }[] }

export default async function ScansPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data, title } = await orgEventRpc<Data>(slug, `/organisateur/evenements/${slug}/scans`, 'org_scan_history');
  return (
    <main className="org org-page">
      <LiveRefresh slug={slug} />
      <h1 className="org-head__title">Historique des scans</h1><p className="script">{title}</p>
      <section className="glass ef-card"><h2>Entrées</h2><ProgressBar sold={data.entered} reserved={0} capacity={Math.max(data.expected, 1)} label={`${data.entered} entrées sur ${data.expected} attendus`} /></section>
      {data.rows.length === 0 ? <div className="glass org-empty"><h3>Aucun scan</h3><p>Les entrées scannées s’afficheront ici en direct, avec l’heure et l’agent.</p></div> : (
        <div className="org-table glass"><table><thead><tr><th>Heure</th><th>Participant</th><th>Billet</th><th>Tarif</th><th>Agent</th></tr></thead>
          <tbody>{data.rows.map((r) => <tr key={r.reference}><td data-label="Heure">{formatGp(r.used_at)}</td><td data-label="Participant">{r.holder_first_name} {r.holder_last_name}</td><td data-label="Billet"><code>{r.reference}</code></td><td data-label="Tarif">{r.tier}</td><td data-label="Agent">{r.agent || 'Non renseigné'}</td></tr>)}</tbody></table></div>)}
    </main>
  );
}
