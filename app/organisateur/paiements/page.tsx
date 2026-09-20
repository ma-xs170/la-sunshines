import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import StripePanel from '@/components/organizer/StripePanel';
import { getOrgContext } from '@/lib/organizer/context';
import { editorial, orgRpc } from '@/lib/organizer/data';
import type { PaymentsData } from '@/lib/organizer/analytics';
import { can } from '@/lib/organizer/roles';
import { statusOf, syncStripe, type StripeAccountRow } from '@/lib/organizer/stripe-connect';
import { formatEuro, formatGp } from '@/lib/ticketing/time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Paiements · Espace organisateur', robots: { index: false, follow: false } };

// Paiements : compte Stripe et encaissements. Réservé au propriétaire (et à l'admin) — paramètre « de paiement ».
export default async function PaymentsPage() {
  const { s, current } = await getOrgContext();
  if (!s) redirect('/connexion?next=/organisateur/paiements');
  if (!s.hasAccess || !current || !can(current.my_role, 'owner')) redirect('/organisateur');

  // Compte déjà créé mais pas encore prêt : on relit l'état chez Stripe (au retour de l'inscription, notamment).
  if (current.stripe_connected && !current.stripe_ready) await syncStripe(s.userId, current.id);
  const [acc, pay] = await Promise.all([
    orgRpc<StripeAccountRow>('org_stripe_account', { p_actor: s.userId, p_org: current.id }),
    orgRpc<PaymentsData>('org_payments_summary', { p_actor: s.userId, p_org: current.id }),
  ]);
  const status = acc.ok ? statusOf(acc.data) : 'none';
  const events = pay.ok ? pay.data.events.filter((e) => e.orders > 0) : [];
  const sum = events.reduce((t, e) => ({ gross: t.gross + e.gross_cents, refunded: t.refunded + e.refunded_cents, fees: t.fees + e.fees_cents }), { gross: 0, refunded: 0, fees: 0 });

  return (
    <main className="org org-page">
      <div className="org-head">
        <div>
          <h1 className="org-head__title">Paiements</h1>
          <p className="script">{current.name}</p>
        </div>
      </div>
      {!acc.ok && <p className="admin-error" role="alert">Impossible de charger l’état du compte pour l’instant.</p>}
      <StripePanel org={current.id} status={status} />

      <section className="org-part" aria-labelledby="org-enc-h">
        <h2 id="org-enc-h">Encaissements</h2>
        <section className="org-kpis" aria-label="Totaux">
          <div className="glass org-kpi"><span className="kicker">Ventes en ligne</span><strong>{formatEuro(sum.gross)}</strong><span>toutes taxes et frais compris</span></div>
          <div className="glass org-kpi"><span className="kicker">Remboursés</span><strong>{formatEuro(sum.refunded)}</strong><span>déjà restitués aux acheteurs</span></div>
          <div className="glass org-kpi"><span className="kicker">Net</span><strong>{formatEuro(sum.gross - sum.refunded)}</strong><span>dont {formatEuro(sum.fees)} de frais de service</span></div>
        </section>
        {events.length === 0 ? (
          <div className="glass org-empty"><p className="script">Rien pour l’instant</p><p>Les encaissements de vos événements apparaîtront ici dès la première vente en ligne.</p></div>
        ) : (
          <div className="org-table glass">
            <table>
              <thead><tr><th>Événement</th><th>Commandes</th><th>Ventes</th><th>Remboursés</th><th>Frais de service</th><th>Net</th></tr></thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.slug}>
                    <td data-label="Événement"><strong>{editorial(e.slug).title}</strong><br /><span className="org-muted">{formatGp(e.starts_at)}</span></td>
                    <td data-label="Commandes">{e.orders}</td>
                    <td data-label="Ventes">{formatEuro(e.gross_cents)}</td>
                    <td data-label="Remboursés">{formatEuro(e.refunded_cents)}</td>
                    <td data-label="Frais de service">{formatEuro(e.fees_cents)}</td>
                    <td data-label="Net"><strong>{formatEuro(e.gross_cents - e.refunded_cents)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
