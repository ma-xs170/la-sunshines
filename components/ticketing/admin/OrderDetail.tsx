'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatEuro, formatGp, formatPrice } from '@/lib/ticketing/time';

interface Detail {
  order: { id: string; order_number: string; status: string; source: string; buyer_email: string; buyer_first_name: string; buyer_last_name: string; buyer_phone: string;
    subtotal_cents: number; fee_cents: number; total_cents: number; refunded_cents: number; created_at: string; paid_at: string | null; stripe_payment_intent_id: string | null;
    email_status: string; email_attempts: number; email_last_error: string | null; email_sent_at: string | null; order_items: { id: string; tier_name: string; quantity: number; unit_price_cents: number; event_title: string; event_starts_at: string; venue_name: string }[] };
  tickets: { id: string; status: string; holder_first_name: string; holder_last_name: string; used_at: string | null }[];
  refunds: { id: string; amount_cents: number; status: string; reason: string | null; source: string; created_at: string; stripe_refund_id: string | null }[];
}
const TSTATUS: Record<string, string> = { valid: 'Valide', used: 'Entré', cancelled: 'Annulé', refunded: 'Remboursé' };
const call = async (url: string, method: string, body?: unknown) => {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { ok: r.ok, data: await r.json().catch(() => ({})) };
};

export default function OrderDetail({ id }: { id: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [rid, setRid] = useState(() => crypto.randomUUID());       // clé d'idempotence : un double clic ne rembourse qu'une fois

  const load = useCallback(async () => {
    const r = await call(`/api/billetterie/admin/orders/${id}`, 'GET');
    if (!r.ok) return setErr(r.data.error ?? 'Chargement impossible.');
    setD(r.data);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function act(fn: () => Promise<{ ok: boolean; data: { error?: string } }>, okMsg: string) {
    setBusy(true); setErr(''); setMsg('');
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setErr(r.data.error ?? 'Action impossible.');
    setMsg(okMsg);
    setRid(crypto.randomUUID());
    load();
  }

  if (err && !d) return <p className="admin-error" role="alert">{err}</p>;
  if (!d) return <p className="admin-hint">Chargement…</p>;
  const { order: o, tickets, refunds } = d;
  const remaining = o.total_cents - o.refunded_cents;
  const refundable = ['paid', 'partially_refunded'].includes(o.status) && o.stripe_payment_intent_id && remaining > 0;

  function refund(full: boolean) {
    const cents = full ? undefined : Math.round(Number(amount.replace(',', '.')) * 100);
    if (!full && (!Number.isFinite(cents) || !cents || cents <= 0)) return setErr('Indique un montant valide.');
    const label = full ? `le TOTAL restant (${formatEuro(remaining)}, frais de service compris)` : formatEuro(cents!);
    if (!window.confirm(`Rembourser ${label} via Stripe ? Action irréversible.`)) return;
    act(() => call(`/api/billetterie/admin/orders/${id}/refund`, 'POST', { request_id: rid, amount_cents: cents, reason, cancel_ticket_ids: full ? [] : picked }), 'Remboursement effectué.');
  }

  return (
    <div className="ord-detail">
      <section className="admin-panel glass">
        <h2>{o.order_number} <span className={`tk__badge tk__badge--${o.status}`}>{o.status}</span></h2>
        <p>{o.buyer_first_name} {o.buyer_last_name} — {o.buyer_email} {o.buyer_phone && `— ${o.buyer_phone}`}</p>
        <p className="admin-hint">{o.source === 'manual' ? 'Invitation (sans paiement)' : o.total_cents === 0 ? `Commande gratuite (aucun paiement, aucun remboursement) du ${o.paid_at ? formatGp(o.paid_at) : '—'}` : `Payée le ${o.paid_at ? formatGp(o.paid_at) : '—'}`} · {o.order_items[0]?.event_title} · {formatGp(o.order_items[0]?.event_starts_at)}</p>
        <table className="ord"><tbody>
          {o.order_items.map((i) => <tr key={i.id}><td>{i.tier_name} × {i.quantity}</td><td>{formatPrice(i.unit_price_cents * i.quantity)}</td></tr>)}
          {o.fee_cents > 0 && <tr><td>Frais de service</td><td>{formatEuro(o.fee_cents)}</td></tr>}
          <tr><td><strong>Total</strong></td><td><strong>{formatPrice(o.total_cents)}</strong></td></tr>
          {o.refunded_cents > 0 && <tr><td>Remboursé</td><td>{formatEuro(o.refunded_cents)}</td></tr>}
        </tbody></table>
      </section>

      <section className="admin-panel glass">
        <h2>Email de billets</h2>
        <p className="admin-hint">Statut : <strong>{o.email_status}</strong> · {o.email_attempts} tentative(s){o.email_last_error && <> · dernière erreur : <span className="admin-error">{o.email_last_error}</span></>}</p>
        <button className="btn btn--outline" disabled={busy || !['paid', 'partially_refunded', 'refunded'].includes(o.status)} onClick={() => act(() => call(`/api/billetterie/admin/orders/${id}/resend`, 'POST'), 'Email renvoyé.')}>Renvoyer l’email de billets</button>
      </section>

      <section className="admin-panel glass">
        <h2>Billets</h2>
        <ul className="admin-list">
          {tickets.map((t) => (
            <li key={t.id} className="admin-list__item">
              <div><strong>{t.holder_first_name} {t.holder_last_name}</strong> — {TSTATUS[t.status] ?? t.status}{t.used_at && ` (${formatGp(t.used_at)})`}</div>
              {t.status === 'valid' && (
                <div className="admin-form__actions">
                  {refundable && <label><input type="checkbox" checked={picked.includes(t.id)} onChange={(e) => setPicked((p) => e.target.checked ? [...p, t.id] : p.filter((x) => x !== t.id))} /> annuler avec le remb. partiel</label>}
                  <button className="admin-mini" disabled={busy} onClick={() => window.confirm('Annuler ce billet (sans remboursement) ?') && act(() => call(`/api/billetterie/admin/tickets/${t.id}/cancel`, 'POST'), 'Billet annulé.')}>Annuler ce billet</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {refundable && (
        <section className="admin-panel glass">
          <h2>Rembourser via Stripe</h2>
          <p className="admin-hint">Reste remboursable : <strong>{formatEuro(remaining)}</strong> (frais de service compris).</p>
          <div className="tb-grid">
            <label className="admin-field"><span>Montant partiel (€)</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="ex. 5,00" /></label>
            <label className="admin-field"><span>Motif</span><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} /></label>
          </div>
          <div className="admin-form__actions">
            <button className="btn btn--outline" disabled={busy} onClick={() => refund(false)}>Remboursement partiel</button>
            <button className="btn btn--amber" disabled={busy} onClick={() => refund(true)}>Rembourser le total restant</button>
          </div>
        </section>
      )}

      {refunds.length > 0 && (
        <section className="admin-panel glass">
          <h2>Remboursements</h2>
          <ul className="admin-list">{refunds.map((r) => <li key={r.id} className="admin-list__item">{formatEuro(r.amount_cents)} — {r.status} — {r.source}{r.reason && ` — ${r.reason}`} — {formatGp(r.created_at)}</li>)}</ul>
        </section>
      )}
      {msg && <p className="admin-note" role="status">{msg}</p>}
      {err && <p className="admin-error" role="alert">{err}</p>}
    </div>
  );
}
