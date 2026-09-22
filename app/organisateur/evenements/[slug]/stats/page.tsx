import type { Metadata } from 'next';
import { orgEventRpc } from '@/lib/organizer/event-data';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Statistiques · Espace organisateur', robots: { index: false, follow: false } };
interface Data { matrix: { day: string; tier: string; sold: number }[]; heat: { dow: number; hour: number; sold: number }[] }
const DOW = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export default async function StatsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data, title } = await orgEventRpc<Data>(slug, `/organisateur/evenements/${slug}/stats`, 'org_sales_matrix');
  const days = [...new Set(data.matrix.map((m) => m.day))].slice(0, 30).sort();
  const tiers = [...new Set(data.matrix.map((m) => m.tier))];
  const cell = new Map(data.matrix.map((m) => [`${m.day}|${m.tier}`, m.sold]));
  const max = Math.max(1, ...data.heat.map((h) => h.sold)); const heat = new Map(data.heat.map((h) => [`${h.dow}|${h.hour}`, h.sold]));
  return (
    <main className="org org-page">
      <h1 className="org-head__title">Ventes</h1><p className="script">{title}</p>
      <section className="glass ef-card"><h2>Ventes par tarif et par jour</h2>
        {days.length === 0 ? <p className="ef-help">Pas encore de vente : le tableau se remplira avec les premières commandes payées (invitations exclues).</p> : (
          <div className="org-table"><table><thead><tr><th>Jour</th>{tiers.map((t) => <th key={t}>{t}</th>)}</tr></thead>
            <tbody>{days.map((d) => <tr key={d}><td data-label="Jour">{new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</td>{tiers.map((t) => <td key={t} data-label={t}>{cell.get(`${d}|${t}`) ?? '·'}</td>)}</tr>)}</tbody></table></div>)}
      </section>
      <section className="glass ef-card"><h2>Moments d’achat (jour de la semaine × heure, heure de Guadeloupe)</h2>
        {data.heat.length === 0 ? <p className="ef-help">Aucune donnée pour l’instant.</p> : (
          <div className="org-table"><table aria-label="Chaleur des ventes"><thead><tr><th />{Array.from({ length: 24 }, (_, h) => <th key={h}>{h}h</th>)}</tr></thead>
            <tbody>{DOW.map((n, i) => <tr key={n}><th scope="row">{n}</th>{Array.from({ length: 24 }, (_, h) => { const v = heat.get(`${i + 1}|${h}`) ?? 0; return <td key={h} title={`${n} ${h}h : ${v} billet(s)`} style={{ background: v ? `rgba(255,178,56,${0.2 + 0.8 * (v / max)})` : undefined, textAlign: 'center', padding: '6px 4px' }}>{v || ''}</td>; })}</tr>)}</tbody></table></div>)}
      </section>
      <p className="org-muted">Audience, acquisition, tunnel de conversion, canaux et géographie : <Link href={`/organisateur/evenements/${slug}/statistiques/vue-densemble`}>autres statistiques de l’évènement</Link>.</p>
    </main>
  );
}
