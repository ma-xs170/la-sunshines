'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '../Icon';
import ProgressBar from './ProgressBar';
import { CHIP_LABEL, TAB_LABEL, NO_FILTERS, activeFilterCount, filterEvents, tabCounts, type CardEvent, type Chip, type Filters, type Tab } from '@/lib/organizer/browse';
import { STATE_LABEL } from '@/lib/organizer/status';
import { formatEuro } from '@/lib/ticketing/time';

export type { CardEvent };
type View = 'grid' | 'list' | 'carousel';
const KEY = 'sun_org_view';

function ArchiveButton({ e }: { e: CardEvent }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function go() {
    setBusy(true); setErr('');
    const r = await fetch(`/api/organisateur/events/${e.slug}/archive`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: !e.archived }) });
    setBusy(false);
    if (r.ok) router.refresh(); else setErr((await r.json().catch(() => ({}))).error ?? 'Échec.');
  }
  const label = e.archived ? 'Désarchiver' : 'Archiver';
  return (
    <span className="org-card__archive">
      <button type="button" className="org-iconbtn" onClick={go} disabled={busy} aria-label={`${label} « ${e.title} »`} title={label}><Icon name={e.archived ? 'inbox' : 'archive'} /></button>
      {err && <span className="admin-error" role="alert">{err}</span>}
    </span>
  );
}

function Card({ e, list, canManage }: { e: CardEvent; list: boolean; canManage: boolean }) {
  // Évènement rattaché vendu ailleurs (Bizouk) : fiche éditoriale publique, aucune statistique de billetterie.
  const dash = e.external ? `/editions/${e.slug}` : `/organisateur/evenements/${e.slug}`;
  const pct = e.capacity > 0 ? Math.round((e.sold / e.capacity) * 100) : 0;
  const flyer = e.external ? e.flyerSrc : `/api/organisateur/events/${e.slug}/flyer`;
  return (
    <article className={'org-card glass ' + (list ? 'org-card--row' : 'org-card--tile')}>
      <a className="org-card__media" href={dash} tabIndex={-1} aria-hidden="true">
        {e.hasFlyer && flyer ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={flyer} alt="" loading="lazy" />
        ) : (
          <span className="org-card__noflyer script">La Sunshines</span>
        )}
      </a>
      <div className="org-card__body">
        <div className="org-card__head">
          <span className={`org-state org-state--${e.external && e.state === 'on_sale' ? 'draft' : e.state}`}>{e.external && e.state === 'on_sale' ? 'À venir' : STATE_LABEL[e.state]}</span>
          {e.isTest && <span className="org-state org-state--draft">Test</span>}
          {canManage && !e.external && <ArchiveButton e={e} />}
        </div>
        <h3 className="org-card__title"><a href={dash}>{e.title}</a></h3>
        <p className="org-card__meta"><Icon name="calendar" />{e.dateLabel}</p>
        <p className="org-card__meta"><Icon name="map-pin" />{e.venue || 'Lieu à préciser'}</p>
        {e.external ? (
          <p className="org-muted">Vendu via Bizouk — statistiques non disponibles ici</p>
        ) : (
          <>
            <dl className="org-card__stats">
              <div><dt>Participants</dt><dd>{e.sold}</dd></div>
              {e.revenueCents !== null && <div><dt>Revenus</dt><dd>{formatEuro(e.revenueCents)}</dd></div>}
              {e.revenueCents === null && <div><dt>Entrées</dt><dd>{e.entered}</dd></div>}
            </dl>
            {canManage && <ProgressBar sold={e.sold} reserved={e.reserved} capacity={e.capacity} label="Remplissage" compact />}
            {!canManage && <p className="org-bar__text">{pct} % · {e.sold} / {e.capacity} places</p>}
          </>
        )}
        <div className="org-card__actions">
          {e.external ? (
            <a className="btn btn--outline" href={dash}>Voir la fiche</a>
          ) : canManage ? (
            <>
              <a className="btn btn--amber" href={dash}>Tableau de bord</a>
              <a className="btn btn--outline" href={`${dash}?onglet=tarifs#onglets`}>Tarifs</a>
            </>
          ) : (
            <a className="btn btn--amber" href={`${dash}?onglet=scan#onglets`}><Icon name="scan" />Scanner</a>
          )}
        </div>
      </div>
    </article>
  );
}

/** Liste des événements : recherche, puces de statut, onglets, filtres, vue grille / liste (et carrousel sur mobile). */
export default function EventBrowser({ events, canManage, canCreate }: { events: CardEvent[]; canManage: boolean; canCreate: boolean }) {
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [view, setView] = useState<View>('grid');
  const [panel, setPanel] = useState(false);
  const set = (p: Partial<Filters>) => setF((s) => ({ ...s, ...p }));

  useEffect(() => {
    try { const v = localStorage.getItem(KEY); if (v === 'grid' || v === 'list' || v === 'carousel') setView(v); } catch { /* stockage indisponible */ }
  }, []);
  const choose = (v: View) => { setView(v); try { localStorage.setItem(KEY, v); } catch { /* ignore */ } };

  const counts = useMemo(() => tabCounts(events), [events]);
  const shown = useMemo(() => filterEvents(events, f), [events, f]);
  const venues = useMemo(() => [...new Set(events.map((e) => e.venue).filter(Boolean))].sort(), [events]);
  const nFilters = activeFilterCount(f);

  if (events.length === 0) {
    return (
      <div className="glass org-empty">
        <p className="script">Prêt à créer votre premier événement ?</p>
        <h2>Aucun événement</h2>
        <p>Les événements de votre organisation apparaîtront ici dès que leur billetterie sera configurée.</p>
        {canCreate && <a className="btn btn--amber" href="/organisateur/evenements/nouveau"><Icon name="plus" />Créer un événement</a>}
      </div>
    );
  }

  return (
    <div className="obrowse">
      <label className="org-search glass">
        <Icon name="search" />
        <span className="sr-only">Rechercher un événement</span>
        <input type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Rechercher un événement (nom, lieu…)" maxLength={80} />
      </label>

      <div className="org-chips" role="group" aria-label="Filtrer par statut">
        {(Object.keys(CHIP_LABEL) as Chip[]).map((c) => (
          <button key={c} type="button" className={'org-chip' + (f.chip === c ? ' is-active' : '')} aria-pressed={f.chip === c} onClick={() => set({ chip: c })}>{CHIP_LABEL[c]}</button>
        ))}
      </div>

      <div className="org-toolbar glass">
        <div className="org-tabs" role="tablist" aria-label="Période">
          {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={f.tab === t} className={'org-tab' + (f.tab === t ? ' is-active' : '')} onClick={() => set({ tab: t })}>
              {TAB_LABEL[t]}<span className="org-tab__n">{counts[t]}</span>
            </button>
          ))}
        </div>
        <button type="button" className={'org-filterbtn' + (panel ? ' is-open' : '')} aria-expanded={panel} aria-controls="org-filters-panel" onClick={() => setPanel((v) => !v)}>
          <Icon name="filter" />Filtres{nFilters > 0 && <b>{nFilters}</b>}
        </button>
        <div className="org__seg org__seg--icons" role="group" aria-label="Affichage">
          <button type="button" className={view === 'grid' ? 'is-active' : ''} aria-pressed={view === 'grid'} onClick={() => choose('grid')} aria-label="Vue grille" title="Grille"><Icon name="grid" /></button>
          <button type="button" className={view === 'list' ? 'is-active' : ''} aria-pressed={view === 'list'} onClick={() => choose('list')} aria-label="Vue liste" title="Liste"><Icon name="list" /></button>
          <button type="button" className={'org__seg-mobile' + (view === 'carousel' ? ' is-active' : '')} aria-pressed={view === 'carousel'} onClick={() => choose('carousel')} aria-label="Vue carrousel" title="Carrousel"><Icon name="chevron-right" /></button>
        </div>
      </div>

      {panel && (
        <div className="org-fpanel glass" id="org-filters-panel">
          <label className="admin-field"><span>Lieu</span>
            <select value={f.venue} onChange={(e) => set({ venue: e.target.value })}><option value="">Tous les lieux</option>{venues.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
          <label className="admin-field"><span>Du</span><input type="date" value={f.from} max={f.to || undefined} onChange={(e) => set({ from: e.target.value })} /></label>
          <label className="admin-field"><span>Au</span><input type="date" value={f.to} min={f.from || undefined} onChange={(e) => set({ to: e.target.value })} /></label>
          <button type="button" className="btn btn--outline" onClick={() => set({ venue: '', from: '', to: '' })} disabled={nFilters === 0}>Effacer</button>
        </div>
      )}

      <p className="org__count" aria-live="polite">{shown.length} événement{shown.length > 1 ? 's' : ''}</p>
      {shown.length === 0 ? (
        <div className="glass org-empty">
          <h2>Aucun résultat</h2>
          <p>Aucun événement ne correspond à cette recherche dans « {TAB_LABEL[f.tab]} ».</p>
          <button type="button" className="btn btn--outline" onClick={() => setF({ ...NO_FILTERS, tab: f.tab })}>Réinitialiser</button>
        </div>
      ) : (
        <ul className={'org-grid org-grid--' + view}>
          {shown.map((e) => <li key={e.slug}><Card e={e} list={view === 'list'} canManage={canManage} /></li>)}
        </ul>
      )}
    </div>
  );
}
