'use client';

import { useState } from 'react';
import { formatEuro, formatPrice } from '@/lib/ticketing/time';

interface Stats { capacity: number; sold: number; entered: number; invitations: number; orders_paid: number; revenue_cents: number; refunded_cents: number; fill_rate: number;
  tiers: { tier_id: string; name: string; price_cents: number; quantity_total: number; sold: number; reserved: number; revenue_cents: number; fill_rate: number; archived: boolean }[] }

export default function EventStats({ slug }: { slug: string }) {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState('');
  async function load() {
    const r = await fetch(`/api/billetterie/admin/events/${slug}/stats`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(j.error ?? 'Statistiques indisponibles.');
    setErr(''); setS(j);
  }
  return (
    <div className="ord-stats">
      <div className="admin-form__actions">
        <button type="button" className="admin-mini" onClick={load}>{s ? 'Actualiser' : 'Statistiques'}</button>
        <a className="admin-mini" href={`/api/billetterie/admin/export/participants?event=${slug}`}>CSV participants</a>
        <a className="admin-mini" href={`/api/billetterie/admin/export/orders?event=${slug}`}>CSV commandes</a>
      </div>
      {err && <p className="admin-error">{err}</p>}
      {s && (
        <>
          <p className="admin-hint">
            <strong>{s.sold}</strong> / {s.capacity} places vendues ({s.fill_rate} %) · <strong>{s.entered}</strong> entrés · {s.invitations} invitation(s) · {s.orders_paid} commande(s) payée(s)<br />
            Billets <strong>gratuits</strong> : {s.tiers.filter((t) => t.price_cents === 0).reduce((n, t) => n + t.sold, 0)} · <strong>payants</strong> : {s.tiers.filter((t) => t.price_cents > 0).reduce((n, t) => n + t.sold, 0)}<br />
            Chiffre d’affaires net : <strong>{formatEuro(s.revenue_cents)}</strong> (remboursé : {formatEuro(s.refunded_cents)})
          </p>
          <table className="ord"><thead><tr><th>Tarif</th><th>Vendus</th><th>En réservation</th><th>Stock</th><th>Remplissage</th><th>Recette billets</th></tr></thead>
            <tbody>{s.tiers.map((t) => <tr key={t.tier_id}><td>{t.name}{t.archived && ' (archivé)'} — {formatPrice(t.price_cents)}</td><td>{t.sold}</td><td>{t.reserved}</td><td>{t.quantity_total}</td><td>{t.fill_rate} %</td><td>{formatEuro(t.revenue_cents)}</td></tr>)}</tbody></table>
        </>
      )}
    </div>
  );
}
