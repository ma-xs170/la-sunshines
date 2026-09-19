import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import OrderStatusPoller from '@/components/ticketing/OrderStatusPoller';
import { getSession } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/config';
import { formatEuro } from '@/lib/ticketing/time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Commande · LA SUNSHINES', robots: { index: false } };

// Lecture sous RLS : on ne peut voir QUE ses propres commandes.
export default async function SuccesPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order: number } = await searchParams;
  const session = supabaseConfigured() ? await getSession() : null;
  if (!session) redirect(`/connexion?next=${encodeURIComponent('/commande/succes?order=' + (number ?? ''))}`);

  const supabase = await createSupabaseServerClient();
  const { data: order } = number && /^SUN-\d{4,10}$/.test(number)
    ? await supabase
        .from('orders')
        .select('order_number, status, total_cents, buyer_email, order_items(event_title, tier_name, quantity)')
        .eq('order_number', number)
        .maybeSingle()
    : { data: null };

  const paid = order && ['paid', 'partially_refunded', 'refunded'].includes(order.status);
  const pending = order?.status === 'pending';

  return (
    <>
      <Nav />
      <main className="auth content-page">
        {!order ? (
          <>
            <PageHero title="Commande introuvable" />
            <a className="btn btn--outline" href="/compte/billets">Mes billets</a>
          </>
        ) : paid ? (
          <>
            <PageHero eyebrow="Paiement confirmé" title="Merci !" lead={`Commande ${order.order_number} · ${formatEuro(order.total_cents)}`} />
            <div className="contact-form glass contact-form--done">
              <h2>Tes billets sont prêts</h2>
              <p>Un email de confirmation avec tes billets QR part à <strong>{order.buyer_email}</strong>. Ils restent aussi disponibles à tout moment dans « Mes billets ».</p>
              <a className="btn btn--amber" href="/compte/billets">Voir mes billets</a>
            </div>
          </>
        ) : pending ? (
          <>
            <PageHero eyebrow="Un instant…" title="Confirmation en cours" lead={`Commande ${order.order_number}`} />
            <div className="contact-form glass contact-form--done" role="status">
              <p>On attend la confirmation de ta banque. Cette page se met à jour toute seule ; tu recevras aussi un email.</p>
            </div>
            <OrderStatusPoller />
          </>
        ) : (
          <>
            <PageHero title="Commande non confirmée" lead={`Commande ${order.order_number}`} />
            <div className="contact-form glass contact-form--done">
              <p>
                {order.status === 'cancelled'
                  ? 'Cette commande a été annulée. Si un paiement a été débité (par exemple parce que les places ont été épuisées pendant ton paiement), il est remboursé automatiquement en totalité sous quelques jours.'
                  : 'Cette réservation a expiré : les places ont été libérées.'}
              </p>
              <a className="btn btn--outline" href="/editions">Voir les éditions</a>
            </div>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
