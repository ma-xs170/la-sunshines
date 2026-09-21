'use client';

import { useState } from 'react';

export interface Promo { id: string; code: string; title: string; active: boolean; kind: 'fixed' | 'percent'; value: number; max_uses: number | null; used_count: number; starts_at: string | null; ends_at: string | null; tier_ids: string[] | null }
const label = (p: Pick<Promo, 'kind' | 'value'>) => (p.kind === 'percent' ? `−${p.value} %` : `−${(p.value / 100).toFixed(2).replace('.', ',')} €`);
const local = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');

/** Codes de réduction (titre, code, actif, fixe en € ou en %, quantité maximale, dates, tarifs). Le code, le type et la valeur sont figés après création. */
export default function PromosPanel({ slug, initial, tiers }: { slug: string; initial: Promo[]; tiers: { id: string; name: string }[] }) {
  const [list, setList] = useState(initial);
  const [f, setF] = useState({ code: '', title: '', kind: 'percent' as 'fixed' | 'percent', value: '', max: '', start: '', end: '', tiers: [] as string[] });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const put = async (body: Record<string, unknown>) => { const r = await fetch(`/api/organisateur/events/${slug}/promos`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { ok: r.ok, j: await r.json().catch(() => ({})) }; };
  const reload = async () => { const r = await fetch(`/api/organisateur/events/${slug}/promos`, { cache: 'no-store' }); if (r.ok) setList(await r.json()); };

  async function create() {
    setBusy(true); setErr('');
    const raw = Number(f.value.replace(',', '.'));
    const { ok, j } = await put({ code: f.code, title: f.title, kind: f.kind, value: f.kind === 'fixed' ? Math.round(raw * 100) : Math.round(raw), max_uses: f.max ? Number(f.max) : null,
      starts_at: f.start ? new Date(f.start).toISOString() : null, ends_at: f.end ? new Date(f.end).toISOString() : null, tier_ids: f.tiers });
    setBusy(false);
    if (!ok) { setErr(j.error || 'Enregistrement impossible.'); return; }
    setF({ code: '', title: '', kind: 'percent', value: '', max: '', start: '', end: '', tiers: [] }); await reload();
  }
  async function toggle(p: Promo) { const { ok } = await put({ id: p.id, active: !p.active }); if (ok) setList(list.map((x) => (x.id === p.id ? { ...x, active: !p.active } : x))); }

  return (
    <div className="ef">
      <section className="glass ef-card"><h2>Codes de réduction</h2>
        {list.length === 0 ? <p className="ef-help">Aucun code pour l’instant.</p> : (
          <ul className="ef-list">{list.map((p) => (
            <li key={p.id}><div><strong><code>{p.code}</code></strong> {label(p)} <span className="ef-help">{p.title && `${p.title} · `}{p.used_count}{p.max_uses ? ` / ${p.max_uses}` : ''} utilisation{p.used_count > 1 ? 's' : ''}{p.tier_ids ? ' · tarifs choisis' : ' · tous les tarifs'}{p.ends_at ? ` · jusqu’au ${new Date(p.ends_at).toLocaleDateString('fr-FR')}` : ''}</span></div>
              <button type="button" className="ef-link" onClick={() => toggle(p)}>{p.active ? 'Désactiver' : 'Réactiver'}</button></li>))}</ul>)}
        <p className="ef-help">Un code se contrôle et se calcule côté serveur. <strong>Son application au paiement n’est pas encore activée</strong> : elle sera branchée avec la mise en vente réelle.</p>
      </section>
      <section className="glass ef-card"><h2>Nouveau code</h2>
        <div className="ef-grid">
          <div className="ef-field"><label htmlFor="p-c">Code</label><input id="p-c" value={f.code} maxLength={24} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="ETE10" /></div>
          <div className="ef-field"><label htmlFor="p-t">Titre (facultatif)</label><input id="p-t" value={f.title} maxLength={80} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div className="ef-field"><label htmlFor="p-k">Type</label><select id="p-k" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as 'fixed' | 'percent' })}><option value="percent">Pourcentage</option><option value="fixed">Montant fixe (€)</option></select></div>
          <div className="ef-field"><label htmlFor="p-v">{f.kind === 'percent' ? 'Réduction (%)' : 'Réduction (€)'}</label><input id="p-v" inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></div>
          <div className="ef-field"><label htmlFor="p-m">Quantité maximale (facultatif)</label><input id="p-m" inputMode="numeric" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value.replace(/\D/g, '') })} /></div>
          <div className="ef-field"><label htmlFor="p-s">Début (fuseau America/Guadeloupe)</label><input id="p-s" type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></div>
          <div className="ef-field"><label htmlFor="p-e">Fin</label><input id="p-e" type="datetime-local" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></div>
        </div>
        <fieldset className="ef-dress"><legend>Tarifs concernés</legend><p className="ef-help">Aucun coché = tous les tarifs.</p>
          {tiers.map((t) => <label className="ef-check" key={t.id}><input type="checkbox" checked={f.tiers.includes(t.id)} onChange={(e) => setF({ ...f, tiers: e.target.checked ? [...f.tiers, t.id] : f.tiers.filter((x) => x !== t.id) })} />{t.name}</label>)}</fieldset>
        {err && <p className="ef-err" role="alert">{err}</p>}
        <button type="button" className="btn btn--amber" disabled={busy || !f.code || !f.value} onClick={create}>{busy ? 'Enregistrement…' : 'Créer le code'}</button>
      </section>
    </div>
  );
}
