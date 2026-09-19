'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatEuro } from '@/lib/ticketing/time';

interface Row {
  id: string; order_number: string; status: string; source: string; buyer_email: string;
  buyer_first_name: string; buyer_last_name: string; total_cents: number; refunded_cents: number;
  created_at: string; event_slug: string; email_status: string;
  order_items: { tier_name: string; quantity: number }[];
}
const STATUS: Record<string, string> = { pending: 'En attente', paid: 'Payée', expired: 'Expirée', cancelled: 'Annulée', partially_refunded: 'Remb. partiel', refunded: 'Remboursée' };

export default function OrdersList({ events }: { events: { slug: string; name: string }[] }) {
  const [f, setF] = useState({ event: '', status: '', q: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ orders: Row[]; total: number; pageSize: number } | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const sp = new URLSearchParams({ page: String(page) });
    if (f.event) sp.set('event', f.event);
    if (f.status) sp.set('status', f.status);
    if (f.q.trim()) sp.set('q', f.q.trim());
    const r = await fetch('/api/billetterie/admin/orders?' + sp);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(j.error ?? 'Chargement impossible.');
    setErr('');
    setData(j);
  }, [f, page]);
  useEffect(() => { load(); }, [load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setPage(1); setF((s) => ({ ...s, [k]: e.target.value })); };

  return (
    <section className="admin-panel glass">
      <div className="tb-grid">
        <label className="admin-field"><span>Événement</span>
          <select value={f.event} onChange={set('event')}><option value="">Tous</option>{events.map((e) => <option key={e.slug} value={e.slug}>{e.name}</option>)}</select></label>
        <label className="admin-field"><span>Statut</span>
          <select value={f.status} onChange={set('status')}><option value="">Tous</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="admin-field"><span>Recherche (email, nom, n°)</span>
          <input value={f.q} onChange={set('q')} placeholder="ex. camille@…" maxLength={80} /></label>
      </div>
      {err && <p className="admin-error" role="alert">{err}</p>}
      <div className="ord__wrap">
        <table className="ord">
          <thead><tr><th>Commande</th><th>Client</th><th>Billets</th><th>Total</th><th>Statut</th><th>Email</th></tr></thead>
          <tbody>
            {(data?.orders ?? []).map((o) => (
              <tr key={o.id}>
                <td><a className="admin-link" href={`/admin/billetterie/commandes/${o.id}`}>{o.order_number}</a><br /><small>{new Date(o.created_at).toLocaleString('fr-FR', { timeZone: 'America/Guadeloupe' })}</small></td>
                <td>{o.buyer_first_name} {o.buyer_last_name}<br /><small>{o.buyer_email}</small></td>
                <td>{o.order_items.map((i) => `${i.quantity} × ${i.tier_name}`).join(', ')}{o.source === 'manual' && <><br /><small>Invitation</small></>}</td>
                <td>{formatEuro(o.total_cents)}{o.refunded_cents > 0 && <><br /><small>remb. {formatEuro(o.refunded_cents)}</small></>}</td>
                <td><span className={`tk__badge tk__badge--${o.status}`}>{STATUS[o.status] ?? o.status}</span></td>
                <td><small>{o.email_status === 'sent' ? 'envoyé' : o.email_status === 'failed' ? 'ÉCHEC' : 'en attente'}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.orders.length === 0 && <p className="admin-hint">Aucune commande.</p>}
      </div>
      <div className="admin-form__actions">
        <button className="btn btn--outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Précédent</button>
        <span className="admin-hint">Page {page} / {pages} · {data?.total ?? 0} commande(s)</span>
        <button className="btn btn--outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Suivant →</button>
      </div>
    </section>
  );
}
