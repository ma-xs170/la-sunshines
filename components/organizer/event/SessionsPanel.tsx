'use client';

import Link from 'next/link';

import { useState } from 'react';
import type { Venue } from './VenuesPanel';

export interface SessionRow { id: string; venue_id: string | null; label: string; starts_at: string; ends_at: string | null; capacity: number | null; timezone: string }
const local = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const duration = (a: string, b: string | null) => { if (!b) return ''; const m = Math.round((Date.parse(b) - Date.parse(a)) / 60000); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
type Draft = { id?: string; venue_id: string | null; label: string; starts_at: string; ends_at: string; capacity: string };

/** Sessions d'un évènement : dates et horaires (fuseau America/Guadeloupe), durée calculée, lieu et capacité. Changer la date après l'ouverture des ventes demande une confirmation. */
export default function SessionsPanel({ slug, venues, initial }: { slug: string; venues: Venue[]; initial: SessionRow[] }) {
  const [rows, setRows] = useState(initial);
  const [d, setD] = useState<Draft | null>(null);
  const [err, setErr] = useState(''); const [ask, setAsk] = useState(false); const [busy, setBusy] = useState(false);
  const vname = (id: string | null) => venues.find((v) => v.id === id)?.name ?? 'Lieu à préciser';

  async function submit(confirm: boolean) {
    if (!d) return; setBusy(true); setErr('');
    const body = { id: d.id ?? null, venue_id: d.venue_id, label: d.label, starts_at: new Date(d.starts_at).toISOString(), ends_at: d.ends_at ? new Date(d.ends_at).toISOString() : null, capacity: d.capacity ? Number(d.capacity) : null, confirm };
    const res = await fetch(`/api/organisateur/events/${slug}/sessions`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({})); setBusy(false);
    if (res.status === 409 && j.code === 'CONFIRM_DATE_CHANGE') { setAsk(true); return; }
    if (!res.ok) { setErr(j.error || 'Enregistrement impossible.'); return; }
    const row: SessionRow = { id: j.id, venue_id: body.venue_id, label: body.label, starts_at: body.starts_at, ends_at: body.ends_at, capacity: body.capacity, timezone: 'America/Guadeloupe' };
    setRows((l) => (d.id ? l.map((x) => (x.id === row.id ? row : x)) : [...l, row]).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)));
    setD(null); setAsk(false);
  }
  async function remove(id: string) {
    if (!window.confirm('Supprimer cette session ?')) return;
    const res = await fetch(`/api/organisateur/events/${slug}/sessions?id=${id}`, { method: 'DELETE' });
    if (res.ok) setRows((l) => l.filter((x) => x.id !== id)); else setErr('Suppression impossible.');
  }

  return (
    <div className="ef">
      <section className="glass ef-card"><h2>Sessions</h2>
        {rows.length === 0 && !d && <p className="ef-help">Aucune session : ajoute au moins une date pour le calendrier. Les horaires sont en heure de Guadeloupe (America/Guadeloupe).</p>}
        <ul className="ef-list">{rows.map((s) => (
          <li key={s.id}><div><strong>{s.label || 'Session'}</strong><span className="ef-help"> {new Date(s.starts_at).toLocaleString('fr-FR', { timeZone: s.timezone, dateStyle: 'full', timeStyle: 'short' })}
            {s.ends_at ? ` · durée ${duration(s.starts_at, s.ends_at)}` : ''} · {vname(s.venue_id)}{s.capacity ? ` · ${s.capacity} places` : ''}</span></div>
            <div className="ef-row"><button type="button" className="ef-link" onClick={() => setD({ id: s.id, venue_id: s.venue_id, label: s.label, starts_at: local(s.starts_at), ends_at: local(s.ends_at), capacity: s.capacity ? String(s.capacity) : '' })}>Modifier</button>
              <button type="button" className="ef-link" onClick={() => remove(s.id)}>Supprimer</button></div></li>))}</ul>
        {!d && <button type="button" className="btn btn--outline" onClick={() => setD({ venue_id: venues[0]?.id ?? null, label: '', starts_at: '', ends_at: '', capacity: '' })}>Ajouter une session</button>}
        {venues.length === 0 && <p className="ef-help">Pas encore de lieu : <Link className="ef-link" href={`/organisateur/evenements/${slug}/lieux`}>ajoute-en un</Link> pour le relier aux sessions.</p>}
      </section>
      {d && (
        <section className="glass ef-card"><h2>{d.id ? 'Modifier la session' : 'Nouvelle session'}</h2>
          <div className="ef-grid">
            <div className="ef-field"><label htmlFor="s-l">Nom (facultatif)</label><input id="s-l" value={d.label} maxLength={80} onChange={(e) => setD({ ...d, label: e.target.value })} /></div>
            <div className="ef-field"><label htmlFor="s-v">Lieu</label><select id="s-v" value={d.venue_id ?? ''} onChange={(e) => setD({ ...d, venue_id: e.target.value || null })}><option value="">Lieu à préciser</option>{venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
            <div className="ef-field"><label htmlFor="s-s">Début</label><input id="s-s" type="datetime-local" value={d.starts_at} onChange={(e) => setD({ ...d, starts_at: e.target.value })} /></div>
            <div className="ef-field"><label htmlFor="s-e">Fin</label><input id="s-e" type="datetime-local" value={d.ends_at} onChange={(e) => setD({ ...d, ends_at: e.target.value })} /></div>
            <div className="ef-field"><label htmlFor="s-c">Capacité (facultatif)</label><input id="s-c" inputMode="numeric" value={d.capacity} onChange={(e) => setD({ ...d, capacity: e.target.value.replace(/\D/g, '') })} /></div>
          </div>
          {ask && <p className="ef-warn" role="alert">Les ventes sont ouvertes : les acheteurs verront la nouvelle date. Ce changement sera enregistré dans le journal d’audit. <button type="button" className="ef-link" onClick={() => submit(true)}>Confirmer le changement de date</button></p>}
          {err && <p className="ef-err" role="alert">{err}</p>}
          <div className="ef-row"><button type="button" className="btn btn--amber" disabled={busy || !d.starts_at} onClick={() => submit(false)}>{busy ? 'Enregistrement…' : 'Enregistrer la session'}</button><button type="button" className="btn btn--outline" onClick={() => { setD(null); setAsk(false); setErr(''); }}>Annuler</button></div>
        </section>
      )}
    </div>
  );
}
