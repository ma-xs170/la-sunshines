import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ProgressBar from '@/components/organizer/ProgressBar';
import SalesChart from '@/components/organizer/SalesChart';
import TierGauge from '@/components/organizer/TierGauge';
import LiveRefresh from '@/components/organizer/LiveRefresh';
import { orgEventRpc } from '@/lib/organizer/event-data';
import { orgRpc, type OrgStats, type OrgTiers } from '@/lib/organizer/data';
import { countryName, SOURCE_LABEL } from '@/lib/organizer/audience';
import { formatEuro, formatGp } from '@/lib/ticketing/time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Statistiques · Espace organisateur', robots: { index: false, follow: false } };

const VUES: Record<string, string> = {
  'vue-densemble': 'Vue d’ensemble', audience: 'Audience', acquisition: 'Acquisition', tunnel: 'Tunnel de conversion',
  participants: 'Participants', canaux: 'Canaux', geographie: 'Géographie', performance: 'Performance',
};
interface Extra {
  orders: { total: number; paid: number; pending: number; expired: number; cancelled: number };
  by_channel: { channel: string; tickets: number; revenue_cents: number }[]; tickets_by_status: Record<string, number>;
  buyers: { unique: number; repeat: number }; first_sale_at: string | null; last_sale_at: string | null; avg_order_cents: number; tickets_per_order: number;
}
interface Views { total: number; since: string | null; days: { day: string; views: number }[]; sources: { source: string; views: number }[]; countries: { country: string; views: number }[] }
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const STATUS_LABEL: Record<string, string> = { valid: 'Valides (à entrer)', used: 'Entrés', cancelled: 'Annulés', refunded: 'Remboursés' };
const CHANNEL_LABEL: Record<string, string> = { 'en ligne': 'Vente en ligne', gratuit: 'Billets gratuits', invitation: 'Invitations' };

function Share({ label, value, total }: { label: string; value: number; total: number }) {
  const p = pct(value, total);
  return <li className="stat-share"><span>{label}</span><div className="org-bar__track" role="presentation"><span className="org-bar__sold" style={{ width: `${p}%` }} /></div><strong>{value} · {p} %</strong></li>;
}
const Empty = ({ children }: { children: React.ReactNode }) => <div className="glass org-empty"><h3>Pas encore de données</h3><p>{children}</p></div>;

export default async function StatsViewPage({ params }: { params: Promise<{ slug: string; vue: string }> }) {
  const { slug, vue } = await params;
  if (!VUES[vue]) notFound();
  const next = `/organisateur/evenements/${slug}/statistiques/${vue}`;
  const { s, data: st, title } = await orgEventRpc<OrgStats>(slug, next, 'org_event_stats');
  const [ex, vw, tr] = await Promise.all([
    orgRpc<Extra>('org_stats_extra', { p_actor: s.userId, p_slug: slug }), orgRpc<Views>('org_event_views', { p_actor: s.userId, p_slug: slug }),
    vue === 'vue-densemble' ? orgRpc<OrgTiers>('org_tiers', { p_actor: s.userId, p_slug: slug }) : null,
  ]);
  const e = ex.ok ? ex.data : null, v = vw.ok ? vw.data : { total: 0, since: null, days: [], sources: [], countries: [] };
  const NO_AUDIENCE = 'La mesure d’audience compte les visites de la page publique de l’évènement (anonymement : jour, provenance, pays — jamais d’identité). Elle démarre avec les premières visites.';

  return (
    <main className="org org-page">
      <h1 className="org-head__title">{VUES[vue]}</h1><p className="script">{title}</p>
      <nav className="org-subnav" aria-label="Statistiques">
        {Object.entries(VUES).map(([k, l]) => <a key={k} href={`/organisateur/evenements/${slug}/statistiques/${k}`} className={'org-subnav__link' + (k === vue ? ' is-active' : '')} aria-current={k === vue ? 'page' : undefined}>{l}</a>)}
        <a className="org-subnav__link" href={`/organisateur/evenements/${slug}/stats`}>Ventes</a>
      </nav>

      {vue === 'vue-densemble' && (<>
        <LiveRefresh slug={slug} />
        <section className="org-kpis" aria-label="Chiffres clés">
          <div className="glass org-kpi"><span className="kicker">Billets vendus</span><strong>{st.sold}</strong><span>sur {st.capacity} places</span></div>
          <div className="glass org-kpi"><span className="kicker">Places restantes</span><strong>{st.remaining}</strong><span>{st.reserved > 0 ? `dont ${st.reserved} en cours de paiement` : 'disponibles'}</span></div>
          <div className="glass org-kpi"><span className="kicker">Chiffre d’affaires</span><strong>{formatEuro(st.revenue_cents)}</strong><span>{st.refunded_cents > 0 ? `${formatEuro(st.refunded_cents)} remboursés` : 'hors invitations'}</span></div>
          <div className="glass org-kpi"><span className="kicker">Entrées scannées</span><strong>{st.entered}</strong><span>sur {st.sold} billets vendus</span></div>
        </section>
        <section className="glass org-panel"><h2>Remplissage</h2><ProgressBar sold={st.sold} reserved={st.reserved} capacity={st.capacity} label="Événement" /></section>
        <section className="org-part"><h2>Jauges par tarif</h2>
          {st.tiers.length === 0 ? <Empty>Crée un tarif pour voir sa jauge.</Empty> : (
            <ul className="tgauge-list">{(tr?.ok ? tr.data.tiers.map((t) => ({ id: t.id, name: t.name, price_cents: t.price_cents, quantity_total: t.quantity_total, sold: t.sold, reserved: Math.max(t.consumed - t.sold, 0), revenue_cents: st.tiers.find((x) => x.tier_id === t.id)?.revenue_cents ?? 0, archived: t.archived, is_active: t.is_active, sales_start: t.sales_start, sales_end: t.sales_end })) : st.tiers.map((t) => ({ id: t.tier_id, name: t.name, price_cents: t.price_cents, quantity_total: t.quantity_total, sold: t.sold, reserved: t.reserved, revenue_cents: t.revenue_cents, archived: t.archived }))).map((t) => <TierGauge key={t.id} tier={t} />)}</ul>)}
        </section>
        <section className="glass org-panel"><h2>Évolution des ventes</h2><SalesChart series={st.series} /></section>
      </>)}

      {vue === 'audience' && (<>
        <section className="org-kpis"><div className="glass org-kpi"><span className="kicker">Visites de la page</span><strong>{v.total}</strong><span>{v.since ? `depuis le ${new Date(v.since).toLocaleDateString('fr-FR')}` : 'aucune visite enregistrée'}</span></div>
          <div className="glass org-kpi"><span className="kicker">Sur les 7 derniers jours</span><strong>{v.days.slice(-7).reduce((n, d) => n + d.views, 0)}</strong><span>visites</span></div></section>
        {v.total === 0 ? <Empty>{NO_AUDIENCE}</Empty> : (
          <section className="glass ef-card"><h2>Visites par jour (30 derniers jours)</h2>
            <div className="org-table"><table><thead><tr><th>Jour</th><th>Visites</th></tr></thead><tbody>{[...v.days].reverse().map((d) => <tr key={d.day}><td data-label="Jour">{new Date(d.day).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</td><td data-label="Visites">{d.views}</td></tr>)}</tbody></table></div></section>)}
      </>)}

      {vue === 'acquisition' && (v.total === 0 ? <Empty>{NO_AUDIENCE}</Empty> : (
        <section className="glass ef-card"><h2>D’où viennent les visites</h2><ul className="stat-shares">{v.sources.map((x) => <Share key={x.source} label={SOURCE_LABEL[x.source] ?? x.source} value={x.views} total={v.total} />)}</ul>
          <p className="org-muted">« Accès direct » = lien tapé, favori ou application sans provenance transmise (messageries, par exemple).</p></section>))}

      {vue === 'tunnel' && (e && (v.total > 0 || e.orders.total > 0) ? (
        <section className="glass ef-card"><h2>Du visiteur au billet</h2>
          <ol className="stat-funnel">
            <li><span>Visites de la page</span><strong>{v.total}</strong></li>
            <li><span>Commandes démarrées</span><strong>{e.orders.total}</strong><em>{v.total > 0 ? `${pct(e.orders.total, v.total)} % des visites` : ''}</em></li>
            <li><span>Commandes payées</span><strong>{e.orders.paid}</strong><em>{e.orders.total > 0 ? `${pct(e.orders.paid, e.orders.total)} % des commandes démarrées` : ''}</em></li>
          </ol>
          <p className="org-muted">Non abouties : {e.orders.expired} expirée{e.orders.expired > 1 ? 's' : ''}, {e.orders.cancelled} annulée{e.orders.cancelled > 1 ? 's' : ''}, {e.orders.pending} en cours. Ventes en ligne uniquement (invitations exclues).</p></section>
      ) : <Empty>{NO_AUDIENCE} Les commandes démarrées apparaissent dès la première réservation.</Empty>)}

      {vue === 'participants' && (e && st.sold + (e.tickets_by_status.cancelled ?? 0) + (e.tickets_by_status.refunded ?? 0) > 0 ? (<>
        <section className="org-kpis"><div className="glass org-kpi"><span className="kicker">Acheteurs</span><strong>{e.buyers.unique}</strong><span>adresses e-mail distinctes</span></div>
          <div className="glass org-kpi"><span className="kicker">Acheteurs fidèles</span><strong>{e.buyers.repeat}</strong><span>ont commandé plusieurs fois</span></div>
          <div className="glass org-kpi"><span className="kicker">Billets par commande</span><strong>{e.tickets_per_order}</strong><span>en moyenne</span></div></section>
        <section className="glass ef-card"><h2>État des billets</h2><ul className="stat-shares">{Object.entries(e.tickets_by_status).map(([k, n]) => <Share key={k} label={STATUS_LABEL[k] ?? k} value={n} total={Object.values(e.tickets_by_status).reduce((a, b) => a + b, 0)} />)}</ul></section>
        <section className="glass ef-card"><h2>Répartition par tarif</h2><ul className="stat-shares">{st.tiers.filter((t) => t.sold > 0).map((t) => <Share key={t.tier_id} label={t.name} value={t.sold} total={st.sold} />)}</ul></section>
      </>) : <Empty>Les statistiques de participants se remplissent avec les premiers billets.</Empty>)}

      {vue === 'canaux' && (e && e.by_channel.length > 0 ? (
        <section className="glass ef-card"><h2>Par canal de vente</h2>
          <div className="org-table"><table><thead><tr><th>Canal</th><th>Billets</th><th>Recette (hors frais)</th></tr></thead>
            <tbody>{e.by_channel.map((c) => <tr key={c.channel}><td data-label="Canal">{CHANNEL_LABEL[c.channel] ?? c.channel}</td><td data-label="Billets">{c.tickets}</td><td data-label="Recette">{formatEuro(c.revenue_cents)}</td></tr>)}</tbody></table></div></section>
      ) : <Empty>Les canaux (vente en ligne, billets gratuits, invitations) apparaissent avec les premières commandes.</Empty>)}

      {vue === 'geographie' && (v.countries.length === 0 ? <Empty>{NO_AUDIENCE} Le pays est déduit de la connexion du visiteur, sans jamais conserver l’adresse IP.</Empty> : (
        <section className="glass ef-card"><h2>Pays des visiteurs</h2><ul className="stat-shares">{v.countries.map((c) => <Share key={c.country} label={countryName(c.country)} value={c.views} total={v.countries.reduce((n, x) => n + x.views, 0)} />)}</ul></section>))}

      {vue === 'performance' && (e && e.first_sale_at ? (() => {
        const best = [...st.series].sort((a, b) => b.sold - a.sold)[0];
        const last7 = st.series.slice(-7).reduce((n, d) => n + d.sold, 0);
        return (<>
          <section className="org-kpis">
            <div className="glass org-kpi"><span className="kicker">Panier moyen</span><strong>{formatEuro(e.avg_order_cents)}</strong><span>commandes payantes</span></div>
            <div className="glass org-kpi"><span className="kicker">Taux de remplissage</span><strong>{pct(st.sold, st.capacity)} %</strong><span>{st.sold} / {st.capacity} places</span></div>
            <div className="glass org-kpi"><span className="kicker">7 derniers jours</span><strong>{last7}</strong><span>billets vendus</span></div>
            <div className="glass org-kpi"><span className="kicker">Meilleur jour</span><strong>{best ? best.sold : 0}</strong><span>{best ? new Date(best.day).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '—'}</span></div>
          </section>
          <section className="glass ef-card"><h2>Rythme des ventes</h2><p>Première vente : <strong>{formatGp(e.first_sale_at)}</strong>{e.last_sale_at && <> · dernière vente : <strong>{formatGp(e.last_sale_at)}</strong></>}.</p>
            <p>Remboursements : {formatEuro(st.refunded_cents)} ({pct(st.refunded_cents, st.revenue_cents + st.refunded_cents)} % du chiffre d’affaires encaissé).</p></section>
        </>);
      })() : <Empty>Les indicateurs de performance apparaissent dès la première vente.</Empty>)}
    </main>
  );
}
