import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ORDER_STATUS, REFUND_STATUS, orgEventRpc } from '@/lib/organizer/event-data';
import { formatEuro, formatGp } from '@/lib/ticketing/time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Commande · Espace organisateur', robots: { index: false, follow: false } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Detail { order: Record<string, string | number | null>; items: { tier: string; quantity: number; unit_price_cents: number }[];
  tickets: { id: string; reference: string; first_name: string; last_name: string; status: string; used_at: string | null }[];
  refunds: { amount_cents: number; reason: string; status: string; created_at: string }[]; consents: { key: string; label: string; accepted: boolean; at: string }[] }
const T: Record<string, string> = { valid: 'Valide', used: 'Entré', cancelled: 'Annulé', refunded: 'Remboursé' };

export default async function OrderDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!UUID.test(id)) notFound();
  const { data: d, title } = await orgEventRpc<Detail>(slug, `/organisateur/evenements/${slug}/commandes/${id}`, 'org_order_detail', { p_order: id });
  const o = d.order;
  return (
    <main className="org org-page">
      <p className="org__back"><a href={`/organisateur/evenements/${slug}/commandes`}>← Toutes les commandes</a></p>
      <h1 className="org-head__title">Commande {String(o.order_number)}</h1><p className="script">{title}</p>
      <section className="glass ef-card"><h2>Résumé</h2>
        <p>{ORDER_STATUS[String(o.status)] ?? String(o.status)} · {formatGp(String(o.created_at))}{o.source === 'manual' ? ' · invitation' : ''}</p>
        <p>Acheteur : {String(o.buyer_first_name)} {String(o.buyer_last_name)} · {String(o.buyer_email)}{o.buyer_phone ? ` · ${String(o.buyer_phone)}` : ''}</p>
        <p>Sous-total {formatEuro(Number(o.subtotal_cents))} · frais {formatEuro(Number(o.fee_cents))} · <strong>total {formatEuro(Number(o.total_cents))}</strong>{Number(o.refunded_cents) > 0 && ` · remboursé ${formatEuro(Number(o.refunded_cents))}`}</p>
        <p className="org-muted">Confirmation par e-mail : {o.email_status === 'sent' ? 'envoyée' : o.email_status === 'failed' ? 'échec (à renvoyer)' : 'en attente'}. Le remboursement d’une commande est traité par l’équipe LA SUNSHINES : écris-nous depuis le Support.</p></section>
      <section className="glass ef-card"><h2>Billets</h2>
        <div className="org-table"><table><thead><tr><th>Référence</th><th>Titulaire</th><th>Statut</th><th>Entrée</th></tr></thead>
          <tbody>{d.tickets.map((t) => <tr key={t.id}><td data-label="Référence"><code>{t.reference}</code></td><td data-label="Titulaire">{t.first_name} {t.last_name}</td><td data-label="Statut">{T[t.status] ?? t.status}</td><td data-label="Entrée">{t.used_at ? formatGp(t.used_at) : '—'}</td></tr>)}</tbody></table></div>
        <ul className="ef-list">{d.items.map((i, k) => <li key={k}><span>{i.quantity} × {i.tier}</span><span>{formatEuro(i.unit_price_cents)}</span></li>)}</ul></section>
      {d.refunds.length > 0 && <section className="glass ef-card"><h2>Journal des remboursements</h2><ul className="ef-list">{d.refunds.map((r, k) => <li key={k}><span>{formatEuro(r.amount_cents)} · {REFUND_STATUS[r.status] ?? r.status}{r.reason ? ` · ${r.reason}` : ''}</span><span>{formatGp(r.created_at)}</span></li>)}</ul></section>}
      <section className="glass ef-card"><h2>Consentements</h2>
        <p>{o.terms_accepted_at ? `CGV acceptées le ${formatGp(String(o.terms_accepted_at))}` : 'CGV : non renseigné'}{o.guardian_consent_at ? ` · autorisation du représentant légal le ${formatGp(String(o.guardian_consent_at))}` : ''}</p>
        {d.consents.length > 0 && <ul className="ef-list">{d.consents.map((c, k) => <li key={k}><span>{c.accepted ? '✓' : '✗'} {c.label}</span><span>{formatGp(c.at)}</span></li>)}</ul>}</section>
    </main>
  );
}
