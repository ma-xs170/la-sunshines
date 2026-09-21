'use client';

import { useEffect, useRef, useState } from 'react';

interface Org { id: string; reference: string | null; name: string; account_status: 'pending' | 'approved' | 'suspended'; region: string | null }
interface Res { organizers: Org[]; admins: { user_id: string; reference: string; first_name: string; last_name: string }[]; orders: { id: string; order_number: string; event_slug: string; buyer_last_name: string; buyer_first_name: string }[]; events: { slug: string; organizer: string; organizer_id: string }[]; editions: { slug: string; name: string }[]; tickets: { id: string; reference: string; subject: string }[] }
const STATUS = { pending: 'En attente', approved: 'Approuvé', suspended: 'Suspendu' } as const;
const REGION: Record<string, string> = { france: 'France', martinique: 'Martinique', guadeloupe: 'Guadeloupe', sxm: 'SXM' };

/** Recherche globale admin : Cmd/Ctrl+K, résultats instantanés groupés par type, Entrée ouvre le premier résultat. */
export default function GlobalSearch() {
  const [q, setQ] = useState(''); const [res, setRes] = useState<Res | null>(null); const [open, setOpen] = useState(false); const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null); const seq = useRef(0);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.current?.focus(); setOpen(true); } if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return; }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      try { const r = await fetch(`/api/admin-gestion/recherche?q=${encodeURIComponent(q)}`, { cache: 'no-store' }); if (id !== seq.current) return;
        if (!r.ok) { setErr('Recherche indisponible.'); return; } setErr(''); setRes(await r.json()); } catch { setErr('Recherche indisponible.'); }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const first = res ? (res.organizers[0] && `/admin/gestion/organisateurs/${res.organizers[0].id}`) || (res.admins[0] && '/admin/gestion/administrateurs') || (res.events[0] && `/admin/gestion/evenements?q=${res.events[0].slug}`) || (res.editions[0] && `/admin/gestion/evenements?q=${res.editions[0].slug}`) : null;
  const empty = res && !res.organizers.length && !res.admins.length && !res.orders.length && !res.events.length && !res.editions.length && !res.tickets.length;

  return (
    <div className="gsearch" role="search">
      <label className="sr-only" htmlFor="gs-q">Recherche globale</label>
      <input id="gs-q" ref={input} type="search" autoComplete="off" value={q} placeholder="Rechercher… (ORG.20374728, nom, e-mail, SIRET, commande)" onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onKeyDown={(e) => { if (e.key === 'Enter' && first) window.location.assign(first); }} />
      <kbd className="gsearch__kbd" aria-hidden="true">⌘K</kbd>
      {open && q.trim().length >= 2 && (
        <div className="gsearch__panel" role="listbox" aria-label="Résultats">
          {err && <p className="ef-err">{err}</p>}
          {empty && <p className="ef-help">Aucun résultat pour « {q} ».</p>}
          {res?.organizers.length ? <section><h3>Organisateurs</h3>{res.organizers.map((o) => (
            <div className="gsearch__row" key={o.id}><div><code>{o.reference ?? 'sans référence'}</code> <strong>{o.name}</strong><br /><span className="ef-help">{STATUS[o.account_status]}{o.region ? ` · ${REGION[o.region] ?? o.region}` : ''}</span></div>
              <a className="btn btn--outline" href={`/admin/gestion/organisateurs/${o.id}`}>Voir</a></div>))}</section> : null}
          {res?.admins.length ? <section><h3>Administrateurs</h3>{res.admins.map((a) => <div className="gsearch__row" key={a.user_id}><div><code>{a.reference}</code> {a.first_name} {a.last_name}</div><a className="btn btn--outline" href="/admin/gestion/administrateurs">Voir</a></div>)}</section> : null}
          {res?.orders.length ? <section><h3>Commandes</h3>{res.orders.map((o) => <div className="gsearch__row" key={o.id}><div><code>{o.order_number}</code> {o.buyer_first_name} {o.buyer_last_name}<br /><span className="ef-help">{o.event_slug}</span></div><a className="btn btn--outline" href={`/admin/billetterie/commandes/${o.id}`}>Voir</a></div>)}</section> : null}
          {res?.tickets.length ? <section><h3>Tickets support</h3>{res.tickets.map((t) => <div className="gsearch__row" key={t.id}><div><code>{t.reference}</code> {t.subject}</div><a className="btn btn--outline" href={`/admin/gestion/support/${t.id}`}>Voir</a></div>)}</section> : null}
          {res && (res.events.length || res.editions.length) ? <section><h3>Évènements</h3>
            {res.events.map((e) => <div className="gsearch__row" key={e.slug}><div>{e.slug}<br /><span className="ef-help">{e.organizer}</span></div><a className="btn btn--outline" href={`/admin/gestion/evenements?q=${e.slug}`}>Voir</a></div>)}
            {res.editions.map((e) => <div className="gsearch__row" key={e.slug}><div>{e.name}</div><a className="btn btn--outline" href={`/admin/gestion/evenements?q=${e.slug}`}>Voir</a></div>)}</section> : null}
        </div>
      )}
    </div>
  );
}
