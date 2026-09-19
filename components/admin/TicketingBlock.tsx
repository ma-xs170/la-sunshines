'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminEventView, AdminTier } from '@/lib/ticketing/admin';
import { euroToCents, formatEuro, gpLocalToIso, isoToGpLocal } from '@/lib/ticketing/time';

type Edition = { slug: string; name: string; dateISO: string | null; timeLabel: string | null; venue: string };
type Loaded = AdminEventView & { edition: Edition };
type Phase = 'loading' | 'unauth' | 'forbidden' | 'unavailable' | 'error' | 'ready';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon (invisible)',
  published: 'Publié (ventes ouvertes selon les dates)',
  closed: 'Clos (ventes arrêtées)',
  cancelled: 'Annulé',
};

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/** Heure de début proposée pour un événement pas encore configuré (date + « 16h–22h » de l'édition). */
function defaultStart(ed: Edition): string {
  if (!ed.dateISO) return '';
  const m = (ed.timeLabel ?? '').match(/(\d{1,2})\s*h\s*(\d{2})?/i);
  const hh = String(m ? Number(m[1]) : 20).padStart(2, '0');
  const mm = m?.[2] ?? '00';
  return `${ed.dateISO}T${hh}:${mm}`;
}

// Bloc « Billetterie » de l'édition d'un événement. Écrit dans Supabase (jamais dans
// content.json, donc aucun commit GitHub ni redéploiement). Exige un compte Supabase
// de rôle admin : le mot de passe /admin seul ne suffit pas.
export default function TicketingBlock({ slug }: { slug: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [data, setData] = useState<Loaded | null>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const r = await call(`/api/billetterie/admin/events/${slug}`, 'GET');
    if (r.status === 401) return setPhase('unauth');
    if (r.status === 403) return setPhase('forbidden');
    if (r.status === 503) return setPhase('unavailable');
    if (!r.ok) return setPhase('error');
    setData(r.data as Loaded);
    setPhase('ready');
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="admin-panel glass tb" aria-label="Billetterie">
      <h2>Billetterie</h2>
      {phase === 'loading' && <p className="admin-hint">Chargement…</p>}
      {phase === 'unauth' && (
        <p className="admin-hint">
          La billetterie exige un compte Supabase administrateur (le mot de passe de l’admin ne suffit pas).{' '}
          <a className="admin-link" href="/connexion?next=/admin">Se connecter</a>
        </p>
      )}
      {phase === 'forbidden' && <p className="admin-hint">Ton compte n’a pas le rôle « admin » billetterie.</p>}
      {phase === 'unavailable' && <p className="admin-hint">Supabase n’est pas configuré (variables d’environnement manquantes).</p>}
      {phase === 'error' && <p className="admin-error">Impossible de charger la billetterie. Réessaie.</p>}
      {phase === 'ready' && data && (
        <>
          <EventForm data={data} slug={slug} onSaved={load} setMsg={setMsg} />
          {data.event ? (
            <Tiers data={data} slug={slug} reload={load} setMsg={setMsg} />
          ) : (
            <p className="admin-hint">Enregistre d’abord la configuration ci-dessus pour ajouter des tarifs.</p>
          )}
          {msg && <p className="admin-note" role="status">{msg}</p>}
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
function EventForm({ data, slug, onSaved, setMsg }: { data: Loaded; slug: string; onSaved: () => void; setMsg: (m: string) => void }) {
  const ev = data.event;
  const [f, setF] = useState({
    enabled: ev?.ticketing_enabled ?? false,
    status: ev?.status ?? 'draft',
    starts: ev ? isoToGpLocal(ev.starts_at) : defaultStart(data.edition),
    doors: ev ? isoToGpLocal(ev.doors_open_at) : '',
    ends: ev ? isoToGpLocal(ev.ends_at) : '',
    venue: ev?.venue_name ?? data.edition.venue ?? '',
    address: ev?.venue_address ?? '',
    capacity: String(ev?.capacity ?? ''),
    open: ev ? isoToGpLocal(ev.sales_open_at) : '',
    close: ev ? isoToGpLocal(ev.sales_close_at) : '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    const starts = gpLocalToIso(f.starts);
    if (!starts) return setErr('Indique la date et l’heure de début.');
    const capacity = Number(f.capacity);
    if (!Number.isInteger(capacity) || capacity < 1) return setErr('Indique une capacité (nombre entier ≥ 1).');
    setBusy(true);
    const r = await call(`/api/billetterie/admin/events/${slug}`, 'PUT', {
      starts_at: starts,
      ends_at: gpLocalToIso(f.ends),
      doors_open_at: gpLocalToIso(f.doors),
      venue_name: f.venue,
      venue_address: f.address,
      capacity,
      sales_open_at: gpLocalToIso(f.open),
      sales_close_at: gpLocalToIso(f.close),
      ticketing_enabled: f.enabled,
      status: f.status,
    });
    setBusy(false);
    if (!r.ok) return setErr(r.data.error ?? 'Enregistrement impossible.');
    setMsg('Configuration enregistrée.');
    onSaved();
  }

  return (
    <form onSubmit={save} className="tb-form">
      <p className="admin-hint">
        Toutes les heures sont en <strong>heure de Guadeloupe</strong>. Ces réglages sont enregistrés dans la base
        billetterie : aucun redéploiement.
        {ev && <> Places vendues ou réservées : <strong>{ev.consumed}</strong> / {ev.capacity}.</>}
      </p>
      <div className="tb-grid">
        <label className="admin-field tb-check"><span>Billetterie activée pour cet événement</span>
          <input type="checkbox" checked={f.enabled} onChange={set('enabled')} />
        </label>
        <label className="admin-field"><span>Statut</span>
          <select value={f.status} onChange={set('status')}>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="admin-field"><span>Début</span><input type="datetime-local" value={f.starts} onChange={set('starts')} required /></label>
        <label className="admin-field"><span>Ouverture des portes</span><input type="datetime-local" value={f.doors} onChange={set('doors')} /></label>
        <label className="admin-field"><span>Fin</span><input type="datetime-local" value={f.ends} onChange={set('ends')} /></label>
        <label className="admin-field"><span>Capacité totale</span><input inputMode="numeric" value={f.capacity} onChange={set('capacity')} required /></label>
        <label className="admin-field"><span>Ouverture des ventes</span><input type="datetime-local" value={f.open} onChange={set('open')} /></label>
        <label className="admin-field"><span>Fermeture des ventes</span><input type="datetime-local" value={f.close} onChange={set('close')} /></label>
        <label className="admin-field"><span>Nom du lieu</span><input value={f.venue} onChange={set('venue')} maxLength={120} /></label>
        <label className="admin-field"><span>Adresse du lieu</span><input value={f.address} onChange={set('address')} maxLength={250} /></label>
      </div>
      {err && <p className="admin-error" role="alert">{err}</p>}
      <div className="admin-form__actions">
        <button className="btn btn--amber" type="submit" disabled={busy}>{busy ? '…' : ev ? 'Enregistrer la configuration' : 'Créer la configuration'}</button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
type Draft = {
  id: string | null;
  name: string; description: string; price: string; quantity: string; max: string;
  start: string; end: string; active: boolean; sort: string;
  sold: number; reserved: number; archived: boolean;
};
const fromTier = (t: AdminTier): Draft => ({
  id: t.id, name: t.name, description: t.description, price: String(t.price_cents / 100).replace('.', ','),
  quantity: String(t.quantity_total), max: String(t.max_per_order),
  start: isoToGpLocal(t.sales_start), end: isoToGpLocal(t.sales_end),
  active: t.is_active, sort: String(t.sort_order), sold: t.sold, reserved: t.reserved, archived: t.archived_at !== null,
});
const blank = (n: number): Draft => ({
  id: null, name: '', description: '', price: '', quantity: '', max: '6', start: '', end: '',
  active: true, sort: String(n), sold: 0, reserved: 0, archived: false,
});

function Tiers({ data, slug, reload, setMsg }: { data: Loaded; slug: string; reload: () => void; setMsg: (m: string) => void }) {
  const live = data.tiers.filter((t) => !t.archived_at);
  const archived = data.tiers.filter((t) => t.archived_at);
  const [adding, setAdding] = useState(false);

  return (
    <div className="tb-tiers">
      <h3>Tarifs</h3>
      {live.length === 0 && !adding && <p className="admin-hint">Aucun tarif pour l’instant.</p>}
      {live.map((t) => (
        <TierRow key={t.id + t.quantity_total + t.price_cents} draft={fromTier(t)} slug={slug} reload={reload} setMsg={setMsg} />
      ))}
      {adding ? (
        <TierRow draft={blank(live.length)} slug={slug} reload={() => { setAdding(false); reload(); }} setMsg={setMsg} onCancel={() => setAdding(false)} />
      ) : (
        <button type="button" className="btn btn--outline" onClick={() => setAdding(true)}>+ Ajouter un tarif</button>
      )}
      {archived.length > 0 && (
        <details className="tb-archived">
          <summary>{archived.length} tarif(s) archivé(s)</summary>
          <ul>
            {archived.map((t) => (
              <li key={t.id}>{t.name} — {formatEuro(t.price_cents)} — {t.sold} vendu(s)</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function TierRow({ draft, slug, reload, setMsg, onCancel }: { draft: Draft; slug: string; reload: () => void; setMsg: (m: string) => void; onCancel?: () => void }) {
  const [d, setD] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const floor = d.sold + d.reserved;
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setD((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    const price = euroToCents(d.price);
    if (!Number.isFinite(price) || price < 50) return setErr('Le prix minimum d’un tarif est de 0,50 €.');
    const quantity = Number(d.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) return setErr('Quantité invalide.');
    if (quantity < floor) return setErr(`La quantité doit être d’au moins ${floor} (vendues + réservations en cours).`);
    setBusy(true);
    const r = await call(`/api/billetterie/admin/events/${slug}/tiers`, 'PUT', {
      id: d.id, name: d.name, description: d.description, price_cents: price, quantity_total: quantity,
      max_per_order: Number(d.max), sales_start: gpLocalToIso(d.start), sales_end: gpLocalToIso(d.end),
      is_active: d.active, sort_order: Number(d.sort) || 0,
    });
    setBusy(false);
    if (!r.ok) return setErr(r.data.error ?? 'Enregistrement impossible.');
    setMsg('Tarif enregistré.');
    reload();
  }

  async function remove() {
    if (!d.id) return;
    const sold = floor > 0 || d.sold > 0;
    if (!window.confirm(sold ? 'Ce tarif a des ventes ou des réservations : il sera ARCHIVÉ (jamais supprimé). Continuer ?' : 'Supprimer ce tarif ?')) return;
    setBusy(true);
    const r = await call(`/api/billetterie/admin/events/${slug}/tiers/${d.id}`, 'DELETE');
    setBusy(false);
    if (!r.ok) return setErr(r.data.error ?? 'Suppression impossible.');
    setMsg(r.data.result === 'archived' ? 'Tarif archivé (des commandes le référencent).' : 'Tarif supprimé.');
    reload();
  }

  return (
    <form className="tb-tier" onSubmit={save}>
      <div className="tb-grid">
        <label className="admin-field"><span>Nom</span><input value={d.name} onChange={set('name')} maxLength={80} required /></label>
        <label className="admin-field"><span>Prix (€) — min 0,50</span><input inputMode="decimal" value={d.price} onChange={set('price')} required /></label>
        <label className="admin-field"><span>Quantité totale{floor > 0 && ` (min ${floor})`}</span><input inputMode="numeric" value={d.quantity} onChange={set('quantity')} required /></label>
        <label className="admin-field"><span>Max par commande</span><input inputMode="numeric" value={d.max} onChange={set('max')} required /></label>
        <label className="admin-field"><span>Début de vente</span><input type="datetime-local" value={d.start} onChange={set('start')} /></label>
        <label className="admin-field"><span>Fin de vente</span><input type="datetime-local" value={d.end} onChange={set('end')} /></label>
        <label className="admin-field"><span>Description</span><input value={d.description} onChange={set('description')} maxLength={300} /></label>
        <label className="admin-field"><span>Ordre</span><input inputMode="numeric" value={d.sort} onChange={set('sort')} /></label>
        <label className="admin-field tb-check"><span>Actif</span><input type="checkbox" checked={d.active} onChange={set('active')} /></label>
      </div>
      {d.id && <p className="admin-hint">{d.sold} vendu(s) · {d.reserved} réservation(s) en cours</p>}
      {err && <p className="admin-error" role="alert">{err}</p>}
      <div className="admin-form__actions">
        <button className="btn btn--amber" type="submit" disabled={busy}>{d.id ? 'Enregistrer' : 'Ajouter'}</button>
        {d.id ? (
          <button className="btn btn--outline" type="button" onClick={remove} disabled={busy}>{floor > 0 ? 'Archiver' : 'Supprimer'}</button>
        ) : (
          <button className="btn btn--outline" type="button" onClick={onCancel}>Annuler</button>
        )}
      </div>
    </form>
  );
}
