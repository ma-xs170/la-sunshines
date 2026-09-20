import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import PageHero from '@/components/PageHero';
import ProgressBar from '@/components/organizer/ProgressBar';
import SalesChart from '@/components/organizer/SalesChart';
import ParticipantsSection from '@/components/organizer/ParticipantsSection';
import TiersPanel from '@/components/organizer/TiersPanel';
import Scanner from '@/components/ticketing/Scanner';
import { canManage, getOrgSession } from '@/lib/organizer/access';
import { editorial, orgRpc, type OrgBrief, type OrgStats, type OrgTiers } from '@/lib/organizer/data';
import { eventState, STATE_LABEL } from '@/lib/organizer/status';
import { SLUG_RE } from '@/lib/ticketing/schemas';
import { formatEuro, formatGp } from '@/lib/ticketing/time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Événement · Espace organisateur', robots: { index: false, follow: false } };

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

  const [tr, brief] = await Promise.all([
    tab === 'tarifs' ? orgRpc<OrgTiers>('org_tiers', { p_actor: s.userId, p_slug: slug }) : null,
    tab === 'scan' ? orgRpc<OrgBrief>('org_event_brief', { p_actor: s.userId, p_slug: slug }) : null,
  ]);
  const ed = editorial(slug);
  const state = eventState(stats);
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

        {tab === 'participants' && <ParticipantsSection slug={slug} sp={sp} userId={s.userId} manage={manage} tiers={stats.tiers} replyTo={stats.organizer.contact_email} keep={{ onglet: 'participants' }} />}

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
