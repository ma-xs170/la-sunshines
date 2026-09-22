import type { Metadata } from 'next';
import { orgEventRpc } from '@/lib/organizer/event-data';
import { STAFF_ROLE_LABEL, type StaffRow } from '@/lib/organizer/staff';
import { formatGp } from '@/lib/ticketing/time';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Présences · Espace organisateur', robots: { index: false, follow: false } };

export default async function PresencesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data, title } = await orgEventRpc<StaffRow[]>(slug, `/organisateur/evenements/${slug}/presences`, 'org_staff');
  const active = data.filter((r) => r.scans > 0);
  const total = active.reduce((n, r) => n + r.scans, 0);
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Présences</h1><p className="script">{title}</p>
      <section className="glass ef-card">
        <h2>Activité de scan par personne <span className="org-count">{total} scan{total > 1 ? 's' : ''}</span></h2>
        <p className="org-muted">Une personne est « présente » à partir de son premier scan sur cet évènement. Le détail de chaque scan est dans l’historique des scans.</p>
        {active.length === 0 ? <div className="org-empty"><h3>Aucun scan pour l’instant</h3><p>Les présences apparaissent dès que quelqu’un scanne un billet à l’entrée.</p></div> : (
          <div className="org-table"><table><thead><tr><th>Nom</th><th>Rôle</th><th>Scans</th><th>Premier scan</th><th>Dernier scan</th></tr></thead>
            <tbody>{active.map((m) => <tr key={m.user_id}><td data-label="Nom">{m.name || m.email}</td><td data-label="Rôle">{m.role ? STAFF_ROLE_LABEL[m.role] : 'Hors équipe'}</td><td data-label="Scans">{m.scans}</td><td data-label="Premier scan">{m.first_scan_at ? formatGp(m.first_scan_at) : '—'}</td><td data-label="Dernier scan">{m.last_scan_at ? formatGp(m.last_scan_at) : '—'}</td></tr>)}</tbody></table></div>)}
        <p><Link href={`/organisateur/evenements/${slug}/scans`}>Voir l’historique des scans →</Link></p>
      </section>
    </main>
  );
}
