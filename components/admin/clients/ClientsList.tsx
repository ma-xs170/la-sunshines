'use client';

import { useEffect, useRef, useState, useTransition, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '../../Icon';
import { fmtBirth, fmtDate, NOT_SET, upperName } from '@/lib/admin/clients/format';
import { pageCount, pageWindow, rangeLabel } from '@/lib/admin/clients/pagination';
import { formatPhone } from '@/lib/admin/clients/phone';
import { clientsHref, nextSort, PAGE_SIZE, ROLES, STATUSES, type ClientRow, type ClientsPage, type ClientsQuery, type RoleFilter, type SortKey } from '@/lib/admin/clients/query';
import ExportButton from './ExportButton';

const DEBOUNCE_MS = 300;
const COLS: { key?: SortKey; label: string }[] = [{ label: 'Prénom' }, { key: 'nom', label: 'NOM' }, { label: 'E-mail' }, { label: 'Téléphone(s)' }, { key: 'age', label: 'Naissance' },
  { label: 'À venir' }, { label: 'Passés' }, { key: 'inscription', label: 'Inscrit le' }, { label: 'Statut' }];

const Empty = () => <span className="clients-empty">{NOT_SET}</span>;

function StatusBadges({ r }: { r: ClientRow }) {
  return (
    <span className="clients-badges">
      <span className={'ef-pill' + (r.status === 'active' ? ' ef-pill--ready' : r.status === 'suspended' ? ' ef-pill--failed' : '')}>{STATUSES[r.status]}</span>
      {r.is_minor && <span className="ef-pill ef-pill--processing">Mineur</span>}
      {r.role === 'admin' && <span className="ef-pill">Admin</span>}
      {r.role === 'staff' && <span className="ef-pill">Équipe scan</span>}
    </span>
  );
}

export default function ClientsList({ query, data, error, isSuper }: { query: ClientsQuery; data: ClientsPage | null; error: string | null; isSuper: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(query.q);
  const [hint, setHint] = useState(false);
  // Case à cocher / menu de statut : état optimiste, sinon ils « clignotent » décochés le temps que la nouvelle page arrive
  // (useTransition garde l'ancienne query, donc l'ancienne valeur, pendant le chargement).
  const [opt, setOpt] = useState(query);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typed = useRef(false);

  const go = (q: ClientsQuery, replace = false) => { setOpt(q); startTransition(() => { if (replace) router.replace(clientsHref(q)); else router.push(clientsHref(q)); }); };
  const link = (q: ClientsQuery) => (e: MouseEvent<HTMLAnchorElement>) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); go(q); };

  // Le champ suit l'URL (bouton retour, lien partagé) tant que la personne n'est pas en train de taper.
  useEffect(() => { if (!typed.current) setText(query.q); typed.current = false; }, [query.q]);
  useEffect(() => { setOpt(query); }, [query]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function onType(v: string) {
    setText(v); typed.current = true;
    if (timer.current) clearTimeout(timer.current);
    const t = v.replace(/\s+/g, ' ').trim();
    setHint(t.length === 1);
    if (t.length === 1 || t === query.q) return;   // minimum 2 caractères
    timer.current = setTimeout(() => go({ ...query, q: t, page: 1 }, true), DEBOUNCE_MS);   // anti-rebond 300 ms, retour page 1
  }
  function clear() { if (timer.current) clearTimeout(timer.current); setText(''); setHint(false); typed.current = false; if (query.q) go({ ...query, q: '', page: 1 }, true); }

  const total = data?.total ?? 0; const pages = pageCount(total, PAGE_SIZE); const rows = data?.rows ?? [];
  const filtered = opt.q !== '' || opt.status !== '' || opt.upcoming || opt.minors;
  const roleTabs = (Object.keys(ROLES) as RoleFilter[]).filter((r) => isSuper || r !== 'admins');
  const noun = query.role === 'organizers' ? 'organisateurs' : query.role === 'admins' ? 'administrateurs' : query.role === 'all' ? 'comptes' : 'clients';

  return (
    <div aria-busy={pending}>
      <div className="clients-head">
        <h1 className="org-head__title">Clients</h1>
        {isSuper && <ExportButton query={query} total={total} />}
      </div>

      <form className="clients-search glass" role="search" onSubmit={(e) => { e.preventDefault(); if (timer.current) clearTimeout(timer.current); const t = text.replace(/\s+/g, ' ').trim(); if (t.length !== 1) go({ ...query, q: t, page: 1 }, true); }}>
        <Icon name="search" className="icon clients-search__ico" />
        <label className="sr-only" htmlFor="clients-q">Rechercher un client</label>
        <input id="clients-q" className="clients-search__input" type="search" name="q" value={text} autoComplete="off" spellCheck={false} maxLength={80} enterKeyHint="search"
          placeholder="Rechercher : nom, prénom, e-mail, téléphone, n° de commande (SUN-…) ou de billet (LS-…)" onChange={(e) => onType(e.target.value)} aria-describedby="clients-q-help" />
        {text !== '' && <button type="button" className="clients-search__clear" onClick={clear} aria-label="Effacer la recherche"><Icon name="close" className="icon" /></button>}
        <p id="clients-q-help" className={'clients-search__help' + (hint ? ' is-warn' : '')}>{hint ? 'Saisis au moins 2 caractères.' : 'Sans accent ni majuscule : « elodie » trouve « Élodie ». Téléphone : 0690… et +590 690… sont équivalents.'}</p>
      </form>

      <div className="clients-filters" role="group" aria-label="Filtres">
        <div className="clients-tabs" role="tablist" aria-label="Type de compte">
          {roleTabs.map((r) => <a key={r} role="tab" aria-selected={query.role === r} href={clientsHref({ ...query, role: r, page: 1 })} className={'clients-tab' + (query.role === r ? ' is-active' : '')} onClick={link({ ...query, role: r, page: 1 })}>{ROLES[r]}</a>)}
        </div>
        <label className="clients-filter"><span>Statut</span>
          <select value={opt.status} onChange={(e) => go({ ...query, status: e.target.value as ClientsQuery['status'], page: 1 })}>
            <option value="">Tous les statuts</option>{Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label className="ef-check"><input type="checkbox" checked={opt.upcoming} onChange={(e) => go({ ...query, upcoming: e.target.checked, page: 1 })} />À des évènements à venir</label>
        <label className="ef-check"><input type="checkbox" checked={opt.minors} onChange={(e) => go({ ...query, minors: e.target.checked, page: 1 })} />Mineurs</label>
        {filtered && <a className="ef-link" href={clientsHref({ ...query, q: '', status: '', upcoming: false, minors: false, page: 1 })} onClick={(e) => { e.preventDefault(); clear(); go({ ...query, q: '', status: '', upcoming: false, minors: false, page: 1 }); }}>Réinitialiser</a>}
      </div>

      <p className="clients-count" role="status" aria-live="polite">{error ? '' : pending ? 'Chargement…' : total > 0 ? rangeLabel(data!.page, PAGE_SIZE, total, noun) : `0 ${noun}`}</p>

      {error ? (
        <div className="glass org-empty" role="alert"><h3>Impossible de charger les clients</h3><p>{error}</p><a className="btn btn--amber" href={clientsHref(query)} onClick={link(query)}>Réessayer</a></div>
      ) : pending ? (
        <div className="org-table glass clients-table" aria-hidden="true"><table><tbody>{Array.from({ length: 8 }, (_, i) => <tr key={i}>{COLS.map((c, j) => <td key={j} data-label={c.label}><span className="clients-skel" /></td>)}</tr>)}</tbody></table></div>
      ) : rows.length === 0 ? (
        <div className="glass org-empty"><h3>{query.q ? <>Aucun résultat pour « {query.q} »</> : filtered ? 'Aucun résultat' : `Aucun ${noun.replace(/s$/, '')}`}</h3>
          <p>{filtered ? 'Essaie une autre orthographe, un numéro de téléphone ou retire un filtre.' : 'Les comptes apparaîtront ici dès leur inscription.'}</p></div>
      ) : (
        <div className="org-table glass clients-table">
          <table>
            <caption className="sr-only">Liste des {noun}</caption>
            <thead><tr>{COLS.map((c) => {
              const sorted = c.key && query.sort === c.key;
              return <th key={c.label} scope="col" aria-sort={sorted ? (query.dir === 'asc' ? 'ascending' : 'descending') : c.key ? 'none' : undefined}>
                {c.key ? <a className="clients-sort" href={clientsHref(nextSort(query, c.key))} onClick={link(nextSort(query, c.key))}>{c.label}<span aria-hidden="true">{sorted ? (query.dir === 'asc' ? ' ▲' : ' ▼') : ' ↕'}</span></a> : c.label}
              </th>;
            })}</tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className="clients-row" onClick={(e) => { if (!(e.target as HTMLElement).closest('a,button')) router.push(`/admin/clients/${r.id}`); }}>
                <td data-label="Prénom" className="clients-first">{r.first_name || <Empty />}</td>
                <td data-label="NOM" className="clients-last"><a href={`/admin/clients/${r.id}`} className="clients-name" aria-label={`Ouvrir la fiche de ${r.first_name} ${r.last_name}`.trim()}>{r.last_name ? upperName(r.last_name) : <Empty />}</a></td>
                <td data-label="E-mail" className="clients-mail">{r.email || <Empty />}</td>
                <td data-label="Téléphone(s)">{r.phone || r.phone2 ? <span className="clients-phones">{[r.phone, r.phone2].filter(Boolean).map((p) => <span key={p}>{formatPhone(p)}</span>)}</span> : <Empty />}</td>
                <td data-label="Naissance">{r.birth_date ? <>{fmtBirth(r.birth_date)}{r.age !== null && <span className="clients-age"> · {r.age} ans</span>}</> : <Empty />}</td>
                <td data-label="À venir" className="clients-num">{r.upcoming}</td>
                <td data-label="Passés" className="clients-num">{r.past}</td>
                <td data-label="Inscrit le">{fmtDate(r.created_at)}</td>
                <td data-label="Statut"><StatusBadges r={r} /></td>
              </tr>))}</tbody>
          </table>
        </div>
      )}

      {!error && pages > 1 && (
        <nav className="clients-pager" aria-label="Pagination">
          <ul className="clients-pager__row">
            <li>{query.page > 1 ? <a className="clients-pager__nav" rel="prev" href={clientsHref({ ...query, page: query.page - 1 })} onClick={link({ ...query, page: query.page - 1 })}>Précédent</a> : <span className="clients-pager__nav is-disabled" aria-disabled="true">Précédent</span>}</li>
            {/* Numéros réduits (rayon 1) sur mobile, complets (rayon 2) au-delà de 760 px : deux fenêtres CALCULÉES, jamais un numéro simplement masqué en CSS (qui casserait la suite 1 2 3…). */}
            {pageWindow(query.page, pages, 1).map((p, i) => p === '…'
              ? <li key={`gm${i}`} className="clients-pager__gap clients-pager__num--narrow" aria-hidden="true">…</li>
              : <li key={`m${p}`} className="clients-pager__num--narrow">
                  <a className={'clients-pager__num' + (p === query.page ? ' is-active' : '')} href={clientsHref({ ...query, page: p })} onClick={link({ ...query, page: p })} aria-current={p === query.page ? 'page' : undefined} aria-label={`Page ${p}`}>{p}</a>
                </li>)}
            {pageWindow(query.page, pages).map((p, i) => p === '…'
              ? <li key={`gap${i}`} className="clients-pager__gap clients-pager__num--wide" aria-hidden="true">…</li>
              : <li key={p} className="clients-pager__num--wide">
                  <a className={'clients-pager__num' + (p === query.page ? ' is-active' : '')} href={clientsHref({ ...query, page: p })} onClick={link({ ...query, page: p })} aria-current={p === query.page ? 'page' : undefined} aria-label={`Page ${p}`}>{p}</a>
                </li>)}
            <li>{query.page < pages ? <a className="clients-pager__nav" rel="next" href={clientsHref({ ...query, page: query.page + 1 })} onClick={link({ ...query, page: query.page + 1 })}>Suivant</a> : <span className="clients-pager__nav is-disabled" aria-disabled="true">Suivant</span>}</li>
          </ul>
        </nav>
      )}
    </div>
  );
}
