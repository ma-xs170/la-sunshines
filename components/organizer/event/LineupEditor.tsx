'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { gpLocalToIso, isoToGpLocal } from '@/lib/ticketing/time';

export interface LineupRow { name: string; role: string; starts_at: string | null; ends_at: string | null }
const ROLES: [string, string][] = [['dj', 'DJ'], ['artiste', 'Artiste'], ['invité', 'Invité'], ['animateur', 'Animateur'], ['autre', 'Autre']];
interface Draft { name: string; role: string; start: string; end: string }
const fromRow = (r: LineupRow): Draft => ({ name: r.name, role: r.role, start: isoToGpLocal(r.starts_at), end: isoToGpLocal(r.ends_at) });

/** Lineup : ajouter, ordonner (monter / descendre) et retirer des artistes, avec un créneau facultatif. Enregistré en une fois (ordre = ordre d'affichage). */
export default function LineupEditor({ slug, initial }: { slug: string; initial: LineupRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Draft[]>(initial.map(fromRow));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (i: number, p: Partial<Draft>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) => setRows((r) => { const j = i + d; if (j < 0 || j >= r.length) return r; const c = [...r]; [c[i], c[j]] = [c[j], c[i]]; return c; });

  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (rows.some((r) => !r.name.trim())) { setMsg({ ok: false, text: 'Chaque ligne doit avoir un nom.' }); return; }
    if (rows.some((r) => r.start && r.end && r.end <= r.start)) { setMsg({ ok: false, text: 'La fin d’un créneau doit être après son début.' }); return; }
    setBusy(true);
    const r = await fetch(`/api/organisateur/events/${slug}/lineup`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: rows.map((x) => ({ name: x.name.trim(), role: x.role, starts_at: gpLocalToIso(x.start), ends_at: gpLocalToIso(x.end) })) }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: j.error ?? 'Échec de l’enregistrement.' }); return; }
    setMsg({ ok: true, text: 'Lineup enregistré.' }); router.refresh();
  }

  return (
    <form onSubmit={save} className="lineup">
      {rows.length === 0 && <div className="glass org-empty"><h3>Lineup vide</h3><p>Ajoute les DJs et artistes de la soirée, dans l’ordre de passage.</p></div>}
      <ol className="lineup__list">
        {rows.map((r, i) => (
          <li key={i} className="glass lineup__row">
            <span className="lineup__n" aria-hidden="true">{i + 1}</span>
            <label className="admin-field"><span>Nom</span><input value={r.name} onChange={(e) => set(i, { name: e.target.value })} maxLength={80} required /></label>
            <label className="admin-field"><span>Rôle</span><select value={r.role} onChange={(e) => set(i, { role: e.target.value })}>{ROLES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="admin-field"><span>Début (heure de Guadeloupe)</span><input type="datetime-local" value={r.start} onChange={(e) => set(i, { start: e.target.value })} /></label>
            <label className="admin-field"><span>Fin</span><input type="datetime-local" value={r.end} min={r.start || undefined} onChange={(e) => set(i, { end: e.target.value })} /></label>
            <div className="lineup__actions">
              <button type="button" className="btn btn--ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Monter ${r.name || 'la ligne'}`}>↑</button>
              <button type="button" className="btn btn--ghost" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Descendre ${r.name || 'la ligne'}`}>↓</button>
              <button type="button" className="btn btn--ghost" onClick={() => setRows((x) => x.filter((_, k) => k !== i))}>Retirer</button>
            </div>
          </li>
        ))}
      </ol>
      {msg && <p className={msg.ok ? 'org-ok' : 'admin-error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      <div className="org-settings__foot">
        <button type="button" className="btn btn--outline" disabled={rows.length >= 60} onClick={() => setRows((r) => [...r, { name: '', role: 'dj', start: '', end: '' }])}>Ajouter un artiste</button>
        <button className="btn btn--amber" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer le lineup'}</button>
      </div>
    </form>
  );
}
