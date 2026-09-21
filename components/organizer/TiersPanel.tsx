'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TierGaugeBody, gaugeClass } from './TierGauge';
import type { OrgTierFull } from '@/lib/organizer/data';
import { euroToCents, gpLocalToIso, isoToGpLocal, priceError } from '@/lib/ticketing/time';

interface Draft { id: string | null; name: string; description: string; price: string; quantity: string; maxPerOrder: string; maxPerAccount: string; start: string; end: string; active: boolean; sort: number }
const blank = (sort: number): Draft => ({ id: null, name: '', description: '', price: '', quantity: '', maxPerOrder: '6', maxPerAccount: '2', start: '', end: '', active: true, sort });
const fromTier = (t: OrgTierFull): Draft => ({
  id: t.id, name: t.name, description: t.description, price: (t.price_cents / 100).toFixed(2).replace('.', ','), quantity: String(t.quantity_total),
  maxPerOrder: String(t.max_per_order), maxPerAccount: String(t.max_per_account ?? 2), start: isoToGpLocal(t.sales_start), end: isoToGpLocal(t.sales_end), active: t.is_active, sort: t.sort_order,
});

/** Tarifs d'un événement : création et modification selon les règles de la billetterie (prix 0 € = gratuit ou ≥ 0,50 €, quantité ≥ vendus, archivage si vendu). */
export default function TiersPanel({ slug, tiers, capacity, consumed, revenues = {} }: { slug: string; tiers: OrgTierFull[]; capacity: number; consumed: number; revenues?: Record<string, number> }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const editing = draft?.id ? tiers.find((t) => t.id === draft.id) : undefined;
  const floor = editing?.consumed ?? 0;
  const set = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setErr(''); setInfo('');
    const price = euroToCents(draft.price);
    const pe = priceError(price);
    if (pe) { setErr(pe); return; }
    const qty = Number(draft.quantity);
    if (!Number.isInteger(qty) || qty < 0) { setErr('Indique une quantité (nombre entier).'); return; }
    if (qty < floor) { setErr(`Impossible : ${floor} place(s) sont déjà vendues ou en cours de paiement. La quantité doit être d’au moins ${floor}.`); return; }
    setBusy(true);
    const r = await fetch(`/api/organisateur/events/${slug}/tiers`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: draft.id, name: draft.name, description: draft.description, price_cents: price, quantity_total: qty, max_per_order: Number(draft.maxPerOrder) || 6, ...(price === 0 ? { max_per_account: Number(draft.maxPerAccount) || 2 } : {}),
        sales_start: gpLocalToIso(draft.start), sales_end: gpLocalToIso(draft.end), is_active: draft.active, sort_order: draft.sort }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? 'Échec de l’enregistrement.'); return; }
    setDraft(null); setInfo(draft.id ? 'Tarif modifié.' : 'Tarif créé.'); router.refresh();
  }

  async function remove(t: OrgTierFull) {
    setErr(''); setInfo(''); setBusy(true);
    const r = await fetch(`/api/organisateur/events/${slug}/tiers/${t.id}`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({}));
    setBusy(false); setConfirm(null);
    if (!r.ok) { setErr(j.error ?? 'Échec.'); return; }
    setInfo(j.result === 'archived' ? `« ${t.name} » a des ventes : il est archivé (les billets déjà vendus restent valables).` : `« ${t.name} » a été supprimé.`);
    router.refresh();
  }

  const nextSort = tiers.reduce((m, t) => Math.max(m, t.sort_order), -1) + 1;
  return (
    <div className="org-tiers-panel">
      <div className="org-tiers-panel__head">
        <p className="org-muted">Capacité de l’événement : <strong>{capacity}</strong> places · {consumed} vendues ou en cours de paiement.</p>
        {!draft && <button type="button" className="btn btn--amber" onClick={() => { setDraft(blank(nextSort)); setErr(''); setInfo(''); }}>Créer un tarif</button>}
      </div>
      {info && <p className="org-ok" role="status">{info}</p>}
      {err && !draft && <p className="admin-error" role="alert">{err}</p>}

      {draft && (
        <form className="glass org-tierform" onSubmit={save}>
          <h3>{draft.id ? 'Modifier le tarif' : 'Nouveau tarif'}</h3>
          <div className="org-settings__grid">
            <label className="admin-field"><span>Nom</span><input value={draft.name} onChange={(e) => set({ name: e.target.value })} required maxLength={80} /></label>
            <label className="admin-field"><span>Prix (€) — 0 pour un tarif gratuit</span><input value={draft.price} onChange={(e) => set({ price: e.target.value })} inputMode="decimal" required placeholder="15,00" /></label>
            <label className="admin-field"><span>Quantité{floor > 0 ? ` (au moins ${floor}, déjà vendues ou en cours)` : ''}</span><input type="number" min={floor} max={100000} value={draft.quantity} onChange={(e) => set({ quantity: e.target.value })} required /></label>
            <label className="admin-field"><span>Maximum par commande</span><input type="number" min={1} max={20} value={draft.maxPerOrder} onChange={(e) => set({ maxPerOrder: e.target.value })} /></label>
            {euroToCents(draft.price) === 0 && (
              <label className="admin-field"><span>Maximum par compte (billets gratuits)</span><input type="number" min={1} max={20} value={draft.maxPerAccount} onChange={(e) => set({ maxPerAccount: e.target.value })} /></label>
            )}
            <label className="admin-field"><span>Début de vente (heure de Guadeloupe)</span><input type="datetime-local" value={draft.start} onChange={(e) => set({ start: e.target.value })} /></label>
            <label className="admin-field"><span>Fin de vente</span><input type="datetime-local" value={draft.end} min={draft.start || undefined} onChange={(e) => set({ end: e.target.value })} /></label>
            <label className="admin-field org-settings__wide"><span>Description (facultatif)</span><input value={draft.description} onChange={(e) => set({ description: e.target.value })} maxLength={300} /></label>
          </div>
          <label className="org-composer__check"><input type="checkbox" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} />Tarif en vente</label>
          {err && <p className="admin-error" role="alert">{err}</p>}
          <div className="org-settings__foot">
            <button className="btn btn--amber" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
            <button type="button" className="btn btn--outline" onClick={() => { setDraft(null); setErr(''); }}>Annuler</button>
          </div>
        </form>
      )}

      {tiers.length === 0 && !draft ? (
        <div className="glass org-empty"><h3>Aucun tarif</h3><p>Crée un premier tarif pour ouvrir la vente de billets.</p></div>
      ) : (
        <ul className="org-tierlist tgauge-list">
          {tiers.map((t) => (
            <li key={t.id} className={gaugeClass({ ...t, quantity_total: t.quantity_total, reserved: Math.max(t.consumed - t.sold, 0) }) + ' org-tier' + (t.archived ? ' is-archived' : '')} data-tier-gauge={t.id}>
              <TierGaugeBody tier={{ id: t.id, name: t.name, price_cents: t.price_cents, quantity_total: t.quantity_total, sold: t.sold, reserved: Math.max(t.consumed - t.sold, 0), revenue_cents: revenues[t.id] ?? 0, archived: t.archived, is_active: t.is_active, sales_start: t.sales_start, sales_end: t.sales_end }} />
              {t.description && <p className="org-muted">{t.description}</p>}
              {!t.archived && (
                <div className="org-tier__actions">
                  <button type="button" className="btn btn--outline" onClick={() => { setDraft(fromTier(t)); setErr(''); setInfo(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Modifier</button>
                  {confirm === t.id ? (
                    <>
                      <span className="org-muted">{t.sold > 0 || t.consumed > 0 ? 'Ce tarif a des ventes : il sera archivé.' : 'Supprimer ce tarif ?'}</span>
                      <button type="button" className="btn btn--amber" disabled={busy} onClick={() => remove(t)}>Confirmer</button>
                      <button type="button" className="btn btn--ghost" onClick={() => setConfirm(null)}>Annuler</button>
                    </>
                  ) : (
                    <button type="button" className="btn btn--ghost" onClick={() => setConfirm(t.id)}>{t.sold > 0 ? 'Archiver' : 'Supprimer'}</button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
