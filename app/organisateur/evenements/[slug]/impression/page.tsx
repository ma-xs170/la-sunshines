import type { Metadata } from 'next';
import { orgEventRpc } from '@/lib/organizer/event-data';
import { type OrgStats } from '@/lib/organizer/data';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Imprimer des billets · Espace organisateur', robots: { index: false, follow: false } };

export default async function PrintPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: stats, title } = await orgEventRpc<OrgStats>(slug, `/organisateur/evenements/${slug}/impression`, 'org_event_stats');
  const base = `/api/organisateur/events/${slug}/print`;
  const active = stats.tiers.filter((t) => !t.archived || t.sold > 0);
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Imprimer des billets</h1><p className="script">{title}</p>
      <section className="glass ef-card">
        <h2>Lots de billets en PDF</h2>
        <p className="org-muted">Un billet valide par page (QR code inclus), classés par nom. Seuls les billets <strong>valides</strong> sont imprimés (ni les billets déjà utilisés, ni les annulés ou remboursés). 300 billets au maximum par fichier ; chaque impression est journalisée.</p>
        {active.length === 0 ? <div className="org-empty"><h3>Aucun billet</h3><p>Il n’y a pas encore de tarif ni de billet vendu.</p></div> : (
          <div className="org-table"><table><thead><tr><th>Tarif</th><th>Vendus</th><th /></tr></thead>
            <tbody>
              <tr><td data-label="Tarif"><strong>Tous les tarifs</strong></td><td data-label="Vendus">{stats.sold}</td><td data-label=""><Link className="btn btn--amber" href={base}>Télécharger le PDF</Link></td></tr>
              {active.map((t) => <tr key={t.tier_id}><td data-label="Tarif">{t.name}</td><td data-label="Vendus">{t.sold}</td><td data-label=""><Link className="btn btn--outline" href={`${base}?tier=${t.tier_id}`}>Télécharger le PDF</Link></td></tr>)}
            </tbody></table></div>)}
      </section>
    </main>
  );
}
