import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import PageHero from '@/components/PageHero';
import ProgressBar from '@/components/organizer/ProgressBar';
import SalesChart from '@/components/organizer/SalesChart';
import ParticipantsPanel from '@/components/organizer/ParticipantsPanel';
import TiersPanel from '@/components/organizer/TiersPanel';
import Scanner from '@/components/ticketing/Scanner';
import type { MessageRow } from '@/components/organizer/MessageComposer';
import { canManage, getOrgSession } from '@/lib/organizer/access';
import { editorial, orgRpc, type OrgBrief, type OrgParticipant, type OrgStats, type OrgTiers } from '@/lib/organizer/data';
import { eventState, STATE_LABEL } from '@/lib/organizer/status';
import { SLUG_RE } from '@/lib/ticketing/schemas';
import { formatEuro, formatGp } from '@/lib/ticketing/time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Événement · Espace organisateur', robots: { index: false, follow: false } };

const PAGE = 25;
const SORTS: Record<string, string> = { date: 'Date d’achat', name: 'Nom', tier: 'Tarif', status: 'Statut', ref: 'Référence' };
const STATUSES: Record<string, string> = { valid: 'Valide', used: 'Entré', cancelled: 'Annulé', refunded: 'Remboursé' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function OrganizerEventPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  if (!SLUG_RE.test(slug)) notFound();
  const s = await getOrgSession();
  if (!s) redirect(`/connexion?next=${encodeURIComponent(`/organisateur/evenements/${slug}`)}`);
  if (!s.hasAccess) notFound();

  const st = await orgRpc<OrgStats>('org_event_stats', { p_actor: s.userId, p_slug: slug });
  if (!st.ok) {
    // Staff d'organisation : pas de chiffres ni de participants, seulement le scan de SES événements.
    const brief = await orgRpc<OrgBrief>('org_event_brief', { p_actor: s.userId, p_slug: slug });
    if (!brief.ok) notFound(); // FORBIDDEN ou introuvable : même réponse, on ne révèle rien
    const b = brief.data;
    return (
      <main className="org org-page">
        <p className="org__back"><a href="/organisateur">← Tous les événements</a></p>
        <PageHero eyebrow={b.organizer_name} title={editorial(slug).title} lead={`${formatGp(b.starts_at)}${b.venue_name ? ' · ' + b.venue_name : ''}`} />
        <section aria-labelledby="org-scan-h" className="org-part">
          <h2 id="org-scan-h">Scan à l’entrée</h2>
          <Scanner events={[{ id: b.id, name: editorial(slug).title, startsAt: b.starts_at }]} />
        </section>
      </main>
    );
  }
  const stats = st.data;
  const manage = canManage(s, stats.my_role);
  const TABS = { participants: 'Participants', tarifs: 'Tarifs', scan: 'Scan' } as const;
  const asked = one(sp.onglet);
  const tab: keyof typeof TABS = asked === 'tarifs' && manage ? 'tarifs' : asked === 'scan' ? 'scan' : 'participants';

  const q = one(sp.q).slice(0, 80);
  const tier = UUID.test(one(sp.tier)) ? one(sp.tier) : '';
  const status = STATUSES[one(sp.status)] ? one(sp.status) : '';
  const sort = SORTS[one(sp.sort)] ? one(sp.sort) : 'date';
  const dir = one(sp.dir) === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number.parseInt(one(sp.page), 10) || 1);

  const [pr, ml] = tab !== 'participants' ? [null, null] : await Promise.all([
    orgRpc<{ total: number; rows: OrgParticipant[] }>('org_participants', { p_actor: s.userId, p_slug: slug, p_q: q || null, p_tier: tier || null, p_status: status || null, p_sort: sort, p_dir: dir, p_limit: PAGE, p_offset: (page - 1) * PAGE }),
    orgRpc<MessageRow[]>('org_messages_list', { p_actor: s.userId, p_slug: slug }),
  ]);
  const parts = pr?.ok ? pr.data : { total: 0, rows: [] };
  const pages = Math.max(1, Math.ceil(parts.total / PAGE));

  const [tr, brief] = await Promise.all([
    tab === 'tarifs' ? orgRpc<OrgTiers>('org_tiers', { p_actor: s.userId, p_slug: slug }) : null,
    tab === 'scan' ? orgRpc<OrgBrief>('org_event_brief', { p_actor: s.userId, p_slug: slug }) : null,
  ]);
  const ed = editorial(slug);
  const state = eventState(stats);
  const qs = (over: Record<string, string | number>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | number> = { q, tier, status, sort, dir, page, ...over };
    for (const [k, v] of Object.entries(base)) if (v !== '' && v !== 0 && !(k === 'page' && v === 1) && !(k === 'sort' && v === 'date') && !(k === 'dir' && v === 'desc')) p.set(k, String(v));
    const t = p.toString();
    return t ? `?${t}` : '';
  };
  const exportHref = `/api/organisateur/events/${slug}/export${(() => { const p = new URLSearchParams(); if (tier) p.set('tier', tier); if (status) p.set('status', status); const t = p.toString(); return t ? `?${t}` : ''; })()}`;
  const tiers = stats.tiers.filter((t) => !t.archived || t.sold > 0).map((t) => ({ id: t.tier_id, name: t.name }));

  return (
    <>
      <main className="org org-page">
        <p className="org__back"><a href="/organisateur">← Tous les événements</a></p>
        <PageHero eyebrow={stats.organizer.name} title={ed.title} lead={`${formatGp(stats.starts_at)}${stats.venue_name ? ' · ' + stats.venue_name : ''}`} />
        <div className="org__meta">
          <span className={`org-state org-state--${state}`}>{STATE_LABEL[state]}</span>
        </div>

        <section className="org-kpis" aria-label="Chiffres clés">
          <div className="glass org-kpi"><span className="kicker">Billets vendus</span><strong>{stats.sold}</strong><span>sur {stats.capacity} places</span></div>
          <div className="glass org-kpi"><span className="kicker">Places restantes</span><strong>{stats.remaining}</strong><span>{stats.reserved > 0 ? `dont ${stats.reserved} en cours de paiement` : 'disponibles'}</span></div>
          <div className="glass org-kpi"><span className="kicker">Chiffre d’affaires</span><strong>{formatEuro(stats.revenue_cents)}</strong><span>{stats.refunded_cents > 0 ? `${formatEuro(stats.refunded_cents)} remboursés` : 'hors invitations'}</span></div>
          <div className="glass org-kpi"><span className="kicker">Entrées scannées</span><strong>{stats.entered}</strong><span>sur {stats.sold} billets vendus</span></div>
        </section>

        <section className="glass org-panel" aria-labelledby="org-prog-h">
          <h2 id="org-prog-h">Remplissage</h2>
          <ProgressBar sold={stats.sold} reserved={stats.reserved} capacity={stats.capacity} label="Événement" />
          {stats.tiers.length > 0 && (
            <div className="org-tiers">
              {stats.tiers.map((t) => <ProgressBar key={t.tier_id} sold={t.sold} reserved={t.reserved} capacity={t.quantity_total} label={`${t.name} · ${formatEuro(t.price_cents)}${t.archived ? ' (archivé)' : ''}`} compact />)}
            </div>
          )}
        </section>

        <section className="glass org-panel" aria-labelledby="org-sales-h">
          <h2 id="org-sales-h">Évolution des ventes</h2>
          <SalesChart series={stats.series} />
        </section>

        <div id="onglets" className="org-subnav" role="navigation" aria-label="Sections de l’événement">
          {(Object.keys(TABS) as (keyof typeof TABS)[]).filter((k) => k !== 'tarifs' || manage).map((k) => (
            <a key={k} href={`?onglet=${k}#onglets`} className={'org-subnav__link' + (tab === k ? ' is-active' : '')} aria-current={tab === k ? 'page' : undefined}>{TABS[k]}</a>
          ))}
        </div>

        {tab === 'participants' && (
          <section aria-labelledby="org-part-h" className="org-part">
            <div className="org-part__head">
              <h2 id="org-part-h">Participants <span className="org-count">{parts.total}</span></h2>
              {manage && <a className="btn btn--outline" href={exportHref}>Exporter (CSV)</a>}
            </div>
            <form className="org-filters glass" method="get">
              <label className="admin-field"><span>Recherche</span><input name="q" defaultValue={q} placeholder="Nom, email, référence…" maxLength={80} /></label>
              <label className="admin-field"><span>Tarif</span>
                <select name="tier" defaultValue={tier}><option value="">Tous</option>{stats.tiers.map((t) => <option key={t.tier_id} value={t.tier_id}>{t.name}</option>)}</select></label>
              <label className="admin-field"><span>Statut</span>
                <select name="status" defaultValue={status}><option value="">Tous</option>{Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="admin-field"><span>Tri</span>
                <select name="sort" defaultValue={sort}>{Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="admin-field"><span>Ordre</span>
                <select name="dir" defaultValue={dir}><option value="desc">Décroissant</option><option value="asc">Croissant</option></select></label>
              <div className="org-filters__actions"><button className="btn btn--amber">Filtrer</button>{(q || tier || status) && <a className="btn btn--outline" href="?">Effacer</a>}</div>
            </form>

            <ParticipantsPanel slug={slug} rows={parts.rows} canManage={manage} tiers={tiers} history={ml?.ok ? ml.data : []} replyTo={stats.organizer.contact_email} />

            {pages > 1 && (
              <nav className="org-pager" aria-label="Pagination">
                {page > 1 ? <a className="btn btn--outline" href={qs({ page: page - 1 })}>← Précédent</a> : <span />}
                <span>Page {page} / {pages}</span>
                {page < pages ? <a className="btn btn--outline" href={qs({ page: page + 1 })}>Suivant →</a> : <span />}
              </nav>
            )}
          </section>
        )}

        {tab === 'tarifs' && manage && (
          <section aria-labelledby="org-tarifs-h" className="org-part">
            <h2 id="org-tarifs-h">Tarifs</h2>
            {tr?.ok ? <TiersPanel slug={slug} tiers={tr.data.tiers} capacity={tr.data.capacity} consumed={tr.data.consumed} /> : <p className="admin-error" role="alert">Impossible de charger les tarifs.</p>}
          </section>
        )}

        {tab === 'scan' && (
          <section aria-labelledby="org-scan-h" className="org-part">
            <h2 id="org-scan-h">Scan à l’entrée</h2>
            {brief?.ok ? <Scanner events={[{ id: brief.data.id, name: ed.title, startsAt: brief.data.starts_at }]} /> : <p className="admin-error" role="alert">Scan indisponible.</p>}
          </section>
        )}
      </main>
    </>
  );
}
