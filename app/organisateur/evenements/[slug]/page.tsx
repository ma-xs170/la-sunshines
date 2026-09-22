import type { Metadata } from 'next';
import { forbidden, notFound, redirect } from 'next/navigation';
import PageHero from '@/components/PageHero';
import ProgressBar from '@/components/organizer/ProgressBar';
import TierGauge from '@/components/organizer/TierGauge';
import CopyLink from '@/components/organizer/CopyLink';
import SalesChart from '@/components/organizer/SalesChart';
import LiveRefresh from '@/components/organizer/LiveRefresh';
import ParticipantsSection from '@/components/organizer/ParticipantsSection';
import TiersPanel from '@/components/organizer/TiersPanel';
import Scanner from '@/components/ticketing/Scanner';
import { canManage, getOrgSession } from '@/lib/organizer/access';
import NextSteps from '@/components/organizer/NextSteps';
import { editorial, eventTitle, orgRpc, type OrgBrief, type OrgStats, type OrgTiers } from '@/lib/organizer/data';
import { eventState, STATE_LABEL } from '@/lib/organizer/status';
import { SLUG_RE } from '@/lib/ticketing/schemas';
import { formatEuro, formatGp } from '@/lib/ticketing/time';
import { eventLinks } from '@/lib/organizer/event-links';
import { getAllEditions } from '@/lib/content';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Événement · Espace organisateur', robots: { index: false, follow: false } };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function OrganizerEventPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  if (!SLUG_RE.test(slug)) notFound();
  const s = await getOrgSession();
  if (!s) redirect(`/connexion?next=${encodeURIComponent(`/organisateur/evenements/${slug}`)}`);
  if (!s.hasAccess) forbidden();

  const st = await orgRpc<OrgStats>('org_event_stats', { p_actor: s.userId, p_slug: slug });
  if (!st.ok) {
    // Staff d'organisation : pas de chiffres ni de participants, seulement le scan de SES événements.
    const brief = await orgRpc<OrgBrief>('org_event_brief', { p_actor: s.userId, p_slug: slug });
    if (!brief.ok) notFound(); // FORBIDDEN ou introuvable : même réponse, on ne révèle rien
    const b = brief.data;
    return (
      <main className="org org-page">
        <p className="org__back"><Link href="/organisateur">← Tous les événements</Link></p>
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
  // Sans onglet : tableau de bord (chiffres clés, remplissage, jauges par tarif). Les onglets n'affichent QUE leur contenu.
  const tab: keyof typeof TABS | null = asked === 'tarifs' && manage ? 'tarifs' : asked === 'scan' ? 'scan' : asked === 'participants' ? 'participants' : null;

  const [tr, brief] = await Promise.all([
    (tab === 'tarifs' || (tab === null && manage)) ? orgRpc<OrgTiers>('org_tiers', { p_actor: s.userId, p_slug: slug }) : null,
    tab === 'scan' ? orgRpc<OrgBrief>('org_event_brief', { p_actor: s.userId, p_slug: slug }) : null,
  ]);
  const ed = { ...editorial(slug), title: await eventTitle(slug) };
  const state = eventState(stats);
  const links = eventLinks(slug, stats.status === 'published', getAllEditions().some((e) => e.slug === slug));
  // jauges : tarifs complets (statut, fenêtres de vente) + chiffre d'affaires du tarif venant des statistiques
  const revenue = Object.fromEntries(stats.tiers.map((t) => [t.tier_id, t.revenue_cents]));
  const gauges = tr?.ok
    ? tr.data.tiers.map((t) => ({ id: t.id, name: t.name, price_cents: t.price_cents, quantity_total: t.quantity_total, sold: t.sold, reserved: Math.max(t.consumed - t.sold, 0), revenue_cents: revenue[t.id] ?? 0, archived: t.archived, is_active: t.is_active, sales_start: t.sales_start, sales_end: t.sales_end }))
    : stats.tiers.map((t) => ({ id: t.tier_id, name: t.name, price_cents: t.price_cents, quantity_total: t.quantity_total, sold: t.sold, reserved: t.reserved, revenue_cents: t.revenue_cents, archived: t.archived }));
  return (
    <>
      <main className="org org-page">
        <p className="org__back"><Link href="/organisateur">← Tous les événements</Link></p>
        <PageHero eyebrow={stats.organizer.name} title={ed.title} lead={`${formatGp(stats.starts_at)}${stats.venue_name ? ' · ' + stats.venue_name : ''}`} />
        <div className="org__meta">
          <span className={`org-state org-state--${state}`}>{STATE_LABEL[state]}</span>
          <a className="btn btn--amber" href={links.viewHref} target="_blank" rel="noopener noreferrer">Voir l’évènement{links.isPreview && <span className="preview-badge" style={{ marginLeft: 8 }}>Aperçu</span>}</a>
        </div>

        <LiveRefresh slug={slug} />
        {tab === null && (
          <>
            {manage && state === 'draft' && <NextSteps slug={slug} userId={s.userId} hasTiers={stats.tiers.length > 0} published={stats.status === 'published'} fresh={one(sp.nouveau) === '1'} hasFlyer={Boolean(ed.flyer)} />}
            <section className="org-kpis" aria-label="Chiffres clés">
              <div className="glass org-kpi"><span className="kicker">Billets vendus</span><strong>{stats.sold}</strong><span>sur {stats.capacity} places</span></div>
              <div className="glass org-kpi"><span className="kicker">Places restantes</span><strong>{stats.remaining}</strong><span>{stats.reserved > 0 ? `dont ${stats.reserved} en cours de paiement` : 'disponibles'}</span></div>
              <div className="glass org-kpi"><span className="kicker">Chiffre d’affaires</span><strong>{formatEuro(stats.revenue_cents)}</strong><span>{stats.refunded_cents > 0 ? `${formatEuro(stats.refunded_cents)} remboursés` : 'hors invitations'}</span></div>
              <div className="glass org-kpi"><span className="kicker">Entrées scannées</span><strong>{stats.entered}</strong><span>sur {stats.sold} billets vendus</span></div>
            </section>

            <section className="glass org-panel" aria-labelledby="org-prog-h">
              <h2 id="org-prog-h">Remplissage</h2>
              <ProgressBar sold={stats.sold} reserved={stats.reserved} capacity={stats.capacity} label="Événement" />
            </section>

            <section aria-labelledby="org-gauges-h" className="org-part">
              <h2 id="org-gauges-h">Jauges par tarif</h2>
              {gauges.length === 0
                ? <div className="glass org-empty"><h3>Aucun tarif</h3><p>Crée un tarif pour voir sa jauge ici.</p>{manage && <p><Link className="btn btn--amber" href="?onglet=tarifs">Créer un tarif</Link></p>}</div>
                : <ul className="tgauge-list">{gauges.map((t) => <TierGauge key={t.id} tier={t} />)}</ul>}
            </section>

            <section className="glass org-panel" aria-labelledby="org-sales-h">
              <h2 id="org-sales-h">Évolution des ventes</h2>
              <SalesChart series={stats.series} />
            </section>

            <section className="glass evlink" aria-labelledby="org-link-h">
              <div>
                <h2 id="org-link-h">Lien public de l’évènement</h2>
                <p><code>{links.publicUrl}</code></p>
                {!links.live && <p className="org-muted">Ce lien sera actif après publication{stats.status === 'published' ? ' (la page publique de cet évènement n’est pas encore en ligne)' : ''}.</p>}
              </div>
              <div className="evlink__row">
                <CopyLink value={links.publicUrl} />
                {!links.live && <CopyLink value={links.previewUrl} label="Copier le lien d’aperçu" />}
              </div>
            </section>
          </>
        )}

        {tab !== null && <div id="onglets" className="org-subnav" role="navigation" aria-label="Sections de l’événement">
          <Link href="?" className="org-subnav__link">Tableau de bord</Link>
          {(Object.keys(TABS) as (keyof typeof TABS)[]).filter((k) => k !== 'tarifs' || manage).map((k) => (
            <Link key={k} href={`?onglet=${k}#onglets`} className={'org-subnav__link' + (tab === k ? ' is-active' : '')} aria-current={tab === k ? 'page' : undefined}>{TABS[k]}</Link>
          ))}
        </div>}

        {tab === 'participants' && <ParticipantsSection slug={slug} sp={sp} userId={s.userId} manage={manage} tiers={stats.tiers} replyTo={stats.organizer.contact_email} keep={{ onglet: 'participants' }} />}

        {tab === 'tarifs' && manage && (
          <section aria-labelledby="org-tarifs-h" className="org-part">
            <h2 id="org-tarifs-h">Tarifs</h2>
            {tr?.ok ? <TiersPanel slug={slug} tiers={tr.data.tiers} capacity={tr.data.capacity} consumed={tr.data.consumed} revenues={revenue} /> : <p className="admin-error" role="alert">Impossible de charger les tarifs.</p>}
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
