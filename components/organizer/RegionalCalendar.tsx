'use client';

import Link from 'next/link';

import { useMemo, useState } from 'react';
import { REGIONS, REGION_LABEL, conflictLevels, dayKey, findConflicts, monthGrid, weekDays, type CalEvent, type Region } from '@/lib/calendar';
import { mapsLink } from '@/lib/organizer/event-pages';

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const DOW = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const STATUS: Record<string, string> = { draft: 'Brouillon', published: 'Publié', closed: 'Terminé', cancelled: 'Annulé' };
const time = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { timeZone: 'America/Guadeloupe', hour: '2-digit', minute: '2-digit' });
const dateL = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'America/Guadeloupe', weekday: 'long', day: 'numeric', month: 'long' });

/** Calendrier régional : mois / semaine / liste, conflits mis en évidence (sans rien bloquer), fiche de l'évènement avec lien de localisation. */
export default function RegionalCalendar({ region, events, admin, names }: { region: Region; events: CalEvent[]; admin: boolean; names: Record<string, string> }) {
  const today = dayKey(new Date().toISOString()); const [y0, m0] = today.split('-').map(Number);
  const [view, setView] = useState<'month' | 'week' | 'list'>('month'); const [ym, setYm] = useState({ y: y0, m: m0 - 1 }); const [week, setWeek] = useState(today);
  const [sel, setSel] = useState<CalEvent | null>(null); const [status, setStatus] = useState('');
  const list = useMemo(() => events.filter((e) => !status || e.status === status), [events, status]);
  const levels = useMemo(() => conflictLevels(findConflicts(list)), [list]);
  const byDay = useMemo(() => { const m = new Map<string, CalEvent[]>(); for (const e of list) { const k = dayKey(e.starts_at); m.set(k, [...(m.get(k) ?? []), e]); } return m; }, [list]);
  const title = (e: CalEvent) => names[e.slug] ?? e.slug;
  const chip = (e: CalEvent) => (
    <button key={e.slug + e.starts_at} type="button" className={'cal-ev' + (levels.get(e.slug) ? ' cal-ev--' + levels.get(e.slug) : '') + (e.status !== 'published' ? ' cal-ev--off' : '')} onClick={() => setSel(e)}>
      <b>{time(e.starts_at)}</b> {title(e)}{levels.get(e.slug) && <span className="sr-only"> (conflit {levels.get(e.slug) === 'venue' ? 'de lieu' : 'de région'})</span>}</button>);
  const move = (d: number) => setYm(({ y, m }) => { const n = m + d; return { y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 }; });
  const shiftWeek = (d: number) => setWeek((w) => new Date(Date.parse(w + 'T00:00:00Z') + d * 7 * 86400000).toISOString().slice(0, 10));

  return (
    <div className="ef">
      <section className="glass ef-card">
        <div className="ef-row" role="group" aria-label="Région">{REGIONS.map((r) => <Link key={r} className={'filter' + (r === region ? ' is-active' : '')} aria-current={r === region ? 'page' : undefined} href={`?region=${r}`}>{REGION_LABEL[r]}</Link>)}</div>
        <div className="ef-row" role="group" aria-label="Vue">{([['month', 'Mois'], ['week', 'Semaine'], ['list', 'Liste']] as const).map(([k, l]) => <button key={k} type="button" className={'filter' + (view === k ? ' is-active' : '')} aria-pressed={view === k} onClick={() => setView(k)}>{l}</button>)}
          {admin && <select aria-label="Statut" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tous les statuts</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}</div>
        <p className="ef-help">Contour orange : deux évènements le même soir dans la région ; contour rouge : même soir au même lieu. Simple avertissement, rien n’est bloqué.</p>
      </section>

      {view === 'month' && (
        <section className="glass ef-card"><div className="ef-row"><button type="button" className="btn btn--outline" onClick={() => move(-1)} aria-label="Mois précédent">←</button><h2 style={{ margin: 0 }}>{MONTHS[ym.m]} {ym.y}</h2><button type="button" className="btn btn--outline" onClick={() => move(1)} aria-label="Mois suivant">→</button></div>
          <div className="cal-grid" role="grid" aria-label={`${MONTHS[ym.m]} ${ym.y}`}>{DOW.map((d) => <div className="cal-h" key={d} role="columnheader">{d}</div>)}
            {monthGrid(ym.y, ym.m).flat().map((k, i) => <div key={i} className={'cal-c' + (k === today ? ' is-today' : '') + (!k ? ' is-empty' : '')} role="gridcell">{k && <span className="cal-d">{Number(k.slice(8))}</span>}{k && (byDay.get(k) ?? []).map(chip)}</div>)}</div></section>)}

      {view === 'week' && (
        <section className="glass ef-card"><div className="ef-row"><button type="button" className="btn btn--outline" onClick={() => shiftWeek(-1)} aria-label="Semaine précédente">←</button><h2 style={{ margin: 0 }}>Semaine du {new Date(weekDays(week)[0] + 'T00:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' })}</h2><button type="button" className="btn btn--outline" onClick={() => shiftWeek(1)} aria-label="Semaine suivante">→</button></div>
          <ul className="ef-list">{weekDays(week).map((k, i) => <li key={k}><div><strong>{DOW[i]} {Number(k.slice(8))}</strong></div><div className="cal-week">{(byDay.get(k) ?? []).length ? (byDay.get(k) ?? []).map(chip) : <span className="ef-help">—</span>}</div></li>)}</ul></section>)}

      {view === 'list' && (
        <section className="glass ef-card"><h2>Évènements à venir</h2>{list.filter((e) => dayKey(e.starts_at) >= today).length === 0 ? <p className="ef-help">Aucun évènement à venir en {REGION_LABEL[region]}.</p> : (
          <ul className="ef-list">{list.filter((e) => dayKey(e.starts_at) >= today).map((e) => <li key={e.slug + e.starts_at}><div><strong>{title(e)}</strong><span className="ef-help"> {dateL(e.starts_at)} · {time(e.starts_at)} · {e.venue}{e.city ? `, ${e.city}` : ''}</span></div><button type="button" className="ef-link" onClick={() => setSel(e)}>Détails</button></li>)}</ul>)}</section>)}

      {sel && (
        <section className="glass ef-card" aria-live="polite"><h2>{title(sel)}</h2>
          <p>{dateL(sel.starts_at)} · {time(sel.starts_at)}{sel.ends_at ? ` – ${time(sel.ends_at)}` : ''} (heure de Guadeloupe)</p>
          <p>Lieu : {sel.venue}{sel.city ? `, ${sel.city}` : ''}<br />Organisateur : {sel.organizer}{sel.mine ? ' (toi)' : ''}{admin && <> · {STATUS[sel.status]}</>}</p>
          {mapsLink({ lat: sel.lat, lng: sel.lng, name: sel.venue, city: sel.city }) && sel.lat != null ? <a className="ef-link" href={mapsLink(sel)!} target="_blank" rel="noopener noreferrer">Ouvrir dans Google Maps</a> : <p className="ef-help">Adresse non communiquée.</p>}
          {levels.get(sel.slug) && <p className="ef-warn">{levels.get(sel.slug) === 'venue' ? 'Un autre évènement est prévu le même soir au même lieu.' : 'Un autre évènement est prévu le même soir dans la région.'}</p>}
          <button type="button" className="ef-link" onClick={() => setSel(null)}>Fermer</button></section>)}
    </div>
  );
}
