'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { feePreview, type FeeMode } from '@/lib/ticketing/fees';
import { euroToCents, formatEuro } from '@/lib/ticketing/time';

/** Frais et paiement : qui paie les frais de service, montant minimum, et aperçu en direct (client / organisateur). Les taux se règlent côté admin. */
export default function FeesForm({ slug, initial, rates, sourceLabel, samplePriceCents, canEdit }: {
  slug: string; initial: { mode: FeeMode; minOrderCents: number }; rates: { percent: number; fixedCents: number }; sourceLabel: string; samplePriceCents: number; canEdit: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<FeeMode>(initial.mode);
  const [min, setMin] = useState(initial.minOrderCents ? (initial.minOrderCents / 100).toFixed(2).replace('.', ',') : '');
  const [price, setPrice] = useState((samplePriceCents / 100).toFixed(2).replace('.', ','));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const pRaw = euroToCents(price);
  const p = Number.isFinite(pRaw) && pRaw > 0 ? pRaw : 0;
  const pv = feePreview(p, rates, mode);
  const minCents = min.trim() === '' ? 0 : euroToCents(min);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (Number.isNaN(minCents) || minCents < 0 || (minCents > 0 && minCents < 50)) { setMsg({ ok: false, text: 'Montant minimum : laisse vide (aucun minimum) ou indique au moins 0,50 €.' }); return; }
    setBusy(true);
    const r = await fetch(`/api/organisateur/events/${slug}/fees`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, min_order_cents: minCents }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: j.error ?? 'Échec de l’enregistrement.' }); return; }
    setMsg({ ok: true, text: 'Réglages enregistrés. Ils s’appliquent aux prochaines commandes.' }); router.refresh();
  }

  return (
    <form className="fees" onSubmit={save}>
      <section className="glass ef-card">
        <h2>Frais de service</h2>
        <p className="org-muted">Taux appliqués à cet évènement ({sourceLabel}) : <strong>{rates.percent} %</strong> + <strong>{formatEuro(rates.fixedCents)}</strong> par commande payante. Ces taux sont fixés par l’équipe LA SUNSHINES ; les billets gratuits n’ont aucun frais.</p>
        <fieldset className="fees__modes" disabled={!canEdit}>
          <legend className="sr-only">Qui paie les frais ?</legend>
          <label className={'fees__mode' + (mode === 'customer' ? ' is-on' : '')}><input type="radio" name="mode" checked={mode === 'customer'} onChange={() => setMode('customer')} /><span><strong>Payés par le client</strong>Les frais s’ajoutent au prix du billet. Tu reçois le prix affiché en entier.</span></label>
          <label className={'fees__mode' + (mode === 'included' ? ' is-on' : '')}><input type="radio" name="mode" checked={mode === 'included'} onChange={() => setMode('included')} /><span><strong>Inclus dans le prix</strong>Le client paie exactement le prix affiché. Les frais sont retenus sur ta part.</span></label>
        </fieldset>
      </section>

      <section className="glass ef-card">
        <h2>Aperçu pour un billet</h2>
        <label className="admin-field fees__price"><span>Prix du billet (€)</span><input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" aria-describedby="fees-preview" /></label>
        <dl id="fees-preview" className="fees__preview">
          <div><dt>Le client paie</dt><dd>{formatEuro(pv.customerPays)}</dd></div>
          <div><dt>Frais de service</dt><dd>{p === 0 ? 'Aucun (gratuit)' : formatEuro(pv.fee)}</dd></div>
          <div className="is-strong"><dt>Tu reçois</dt><dd>{formatEuro(pv.organizerReceives)}</dd></div>
        </dl>
      </section>

      <section className="glass ef-card">
        <h2>Commande</h2>
        <label className="admin-field fees__price"><span>Montant minimum d’une commande (€)</span><input value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" placeholder="Aucun minimum" disabled={!canEdit} /></label>
        <p className="org-muted">Une commande payante d’un montant inférieur est refusée avant le paiement (avant code promo). Les commandes gratuites ne sont pas concernées.</p>
        <h3>Moyens de paiement acceptés</h3>
        <p>Carte bancaire (Visa, Mastercard, Carte Bancaire), payée sur la page sécurisée de Stripe. <strong>Un billet gratuit ne demande aucun paiement.</strong></p>
      </section>

      {msg && <p className={msg.ok ? 'org-ok' : 'admin-error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      {canEdit && <div className="org-settings__foot"><button className="btn btn--amber" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button></div>}
    </form>
  );
}
