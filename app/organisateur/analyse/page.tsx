import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import ProgressBar from '@/components/organizer/ProgressBar';
import SalesChart from '@/components/organizer/SalesChart';
import { getOrgContext } from '@/lib/organizer/context';
import { editorial, orgRpc } from '@/lib/organizer/data';
import { avgTicketCents, parsePeriod, PERIODS, type AnalyticsData, type Period } from '@/lib/organizer/analytics';
import { can } from '@/lib/organizer/roles';
import { formatEuro, formatGp } from '@/lib/ticketing/time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Analyse · Espace organisateur', robots: { index: false, follow: false } };

// Analyse : ventes de l'organisation dans le temps, par événement et par tarif (propriétaire, gestionnaire, admin).
export default async function AnalysisPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { s, current } = await getOrgContext();
  if (!s) redirect('/connexion?next=/organisateur/analyse');
  if (!s.hasAccess || !current || !can(current.my_role, 'manage')) redirect('/organisateur');
  const raw = Array.isArray(sp.periode) ? sp.periode[0] : sp.periode;
  const { key, days } = parsePeriod(raw);
  const r = await orgRpc<AnalyticsData>('org_analytics', { p_actor: s.userId, p_org: current.id, p_days: days });
  const d = r.ok ? r.data : null;

  return (
    <main className="org org-page">
      <div className="org-head">
        <div>
          <h1 className="org-head__title">Analyse</h1>
          <p className="script">{current.name}</p>
        </div>
        <div className="org-chips" role="group" aria-label="Période">
          {(Object.keys(PERIODS) as Period[]).map((p) => (
            <a key={p} href={`?periode=${p}`} className={'org-chip' + (key === p ? ' is-active' : '')} aria-current={key === p ? 'true' : undefined}>{PERIODS[p]}</a>
          ))}
        </div>
      </div>
      {!d && <p className="admin-error" role="alert">Impossible de charger l’analyse pour l’instant.</p>}
      {d && (
        <>
          <section className="org-kpis" aria-label="Chiffres clés">
            <div className="glass org-kpi"><span className="kicker">Billets vendus</span><strong>{d.totals.sold}</strong><span>{PERIODS[key] === 'Tout' ? 'depuis le début' : `sur la période (${PERIODS[key].toLowerCase()})`}</span></div>
            <div className="glass org-kpi"><span className="kicker">Chiffre d’affaires</span><strong>{formatEuro(d.totals.revenue_cents)}</strong><span>{d.totals.refunded_cents > 0 ? `${formatEuro(d.totals.refunded_cents)} remboursés` : 'hors invitations'}</span></div>
            <div className="glass org-kpi"><span className="kicker">Prix moyen d’un billet</span><strong>{formatEuro(avgTicketCents(d.totals.revenue_cents, d.totals.sold))}</strong><span>ventes en ligne</span></div>
            <div className="glass org-kpi"><span className="kicker">Entrées scannées</span><strong>{d.totals.entered}</strong><span>tous événements</span></div>
          </section>

          <section className="glass org-panel" aria-labelledby="org-an-sales">
            <h2 id="org-an-sales">Évolution des ventes</h2>
            <SalesChart series={d.series} />
          </section>

          <section className="org-part" aria-labelledby="org-an-events">
            <h2 id="org-an-events">Par événement</h2>
            {d.events.length === 0 ? <div className="glass org-empty"><p>Aucun événement dans cette organisation.</p></div> : (
              <div className="org-table glass">
                <table>
                  <thead><tr><th>Événement</th><th>Vendus (période)</th><th>Chiffre d’affaires</th><th>Remplissage</th><th /></tr></thead>
                  <tbody>
                    {d.events.map((e) => (
                      <tr key={e.slug}>
                        <td data-label="Événement"><strong>{editorial(e.slug).title}</strong><br /><span className="org-muted">{formatGp(e.starts_at)}</span></td>
                        <td data-label="Vendus (période)">{e.sold}</td>
                        <td data-label="Chiffre d’affaires">{formatEuro(e.revenue_cents)}</td>
                        <td data-label="Remplissage" className="org-table__bar"><ProgressBar sold={e.sold_total} reserved={0} capacity={e.capacity} compact /></td>
                        <td data-label=""><a className="btn btn--outline" href={`/organisateur/evenements/${e.slug}`}>Tableau de bord</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {d.tiers.length > 0 && (
            <section className="org-part" aria-labelledby="org-an-tiers">
              <h2 id="org-an-tiers">Par tarif</h2>
              <div className="org-table glass">
                <table>
                  <thead><tr><th>Tarif</th><th>Vendus</th><th>Chiffre d’affaires</th></tr></thead>
                  <tbody>{d.tiers.map((t) => <tr key={t.name}><td data-label="Tarif"><strong>{t.name}</strong></td><td data-label="Vendus">{t.sold}</td><td data-label="Chiffre d’affaires">{formatEuro(t.revenue_cents)}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
