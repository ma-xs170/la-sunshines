import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import { getSession } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/config';
import { formatEuro, formatGp } from '@/lib/ticketing/time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Mes billets · LA SUNSHINES', robots: { index: false } };

const ORDER_LABEL: Record<string, string> = {
  pending: 'En attente de paiement',
  paid: 'Payée',
  expired: 'Expirée',
  cancelled: 'Annulée',
  partially_refunded: 'Partiellement remboursée',
  refunded: 'Remboursée',
};
const TICKET_LABEL: Record<string, string> = { valid: 'Valide', used: 'Utilisé', cancelled: 'Annulé', refunded: 'Remboursé' };

interface Row {
  id: string;
  order_number: string;
  status: string;
  total_cents: number;
  created_at: string;
  expires_at: string | null;
  order_items: { event_title: string; event_starts_at: string; tier_name: string; quantity: number }[];
  tickets: { id: string; status: string; holder_first_name: string; holder_last_name: string }[];
}
const isActive = (status: string) => status === 'valid' || status === 'used';

// Lecture sous RLS : un client ne voit QUE ses commandes et ses billets.
export default async function MesBilletsPage() {
  const session = supabaseConfigured() ? await getSession() : null;
  if (!session) redirect('/connexion?next=/compte/billets');

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('orders')
    .select('id, order_number, status, total_cents, created_at, expires_at, order_items(event_title, event_starts_at, tier_name, quantity), tickets(id, status, holder_first_name, holder_last_name)')
    .order('created_at', { ascending: false });
  const orders = (data ?? []) as unknown as Row[];

  // billets d'événements à venir (jusqu'à 12 h après le début), tous statuts confondus
  const limit = Date.now() - 12 * 3600 * 1000;
  const upcoming = orders.flatMap((o) =>
    o.tickets
      .filter((t) => Date.parse(o.order_items[0]?.event_starts_at ?? '') >= limit)
      .map((t) => ({ t, o })),
  );

  return (
    <>
      <Nav />
      <main className="auth content-page tk">
        <PageHero eyebrow="Ta soirée t’attend" title="Mes billets" />

        {orders.length === 0 ? (
          <div className="contact-form glass contact-form--done">
            <h2>Aucun billet pour l’instant</h2>
            <p>Tes commandes et tes billets QR apparaîtront ici dès ta première réservation.</p>
            <a className="btn btn--amber" href="/editions">Voir les éditions</a>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <section aria-label="Billets à venir">
                <h2 className="tk__h">Billets à venir</h2>
                <ul className="tk__grid">
                  {upcoming.map(({ t, o }) => (
                    <li key={t.id} className="tk__item">
                      <a className={'tk__card glass' + (t.status === 'valid' || t.status === 'used' ? '' : ' is-off')} href={`/compte/billets/${t.id}`}>
                        <span className="tk__title">{o.order_items[0]?.event_title}</span>
                        <span className="tk__meta">{formatGp(o.order_items[0]?.event_starts_at)}</span>
                        <span className="tk__meta">{t.holder_first_name} {t.holder_last_name} · {o.order_items[0]?.tier_name}</span>
                        <span className={`tk__badge tk__badge--${t.status}`}>{TICKET_LABEL[t.status] ?? t.status}</span>
                      </a>
                      {isActive(t.status) && <a className="tk__pdf" href={`/api/tickets/${t.id}/pdf`}>Télécharger le PDF</a>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-label="Commandes">
              <h2 className="tk__h">Mes commandes</h2>
              <ul className="tk__orders">
                {orders.map((o) => (
                  <li key={o.id} className="glass">
                    <div>
                      <p className="tk__title">{o.order_items[0]?.event_title ?? 'Commande'} <span className="tk__num">{o.order_number}</span></p>
                      <p className="tk__meta">
                        {o.order_items.map((i) => `${i.quantity} × ${i.tier_name}`).join(', ')} · {new Date(o.created_at).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <div className="tk__right">
                      <strong>{formatEuro(o.total_cents)}</strong>
                      <span className={`tk__badge tk__badge--${o.status}`}>{ORDER_LABEL[o.status] ?? o.status}</span>
                      {o.status === 'pending' && <a className="admin-link" href={`/commande/succes?order=${o.order_number}`}>Suivre</a>}
                      {o.tickets.some((t) => isActive(t.status)) && <a className="tk__pdf" href={`/api/orders/${o.id}/pdf`}>PDF de la commande</a>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
