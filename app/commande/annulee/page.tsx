import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import CancelPendingOrder from '@/components/ticketing/CancelPendingOrder';
import { getSession } from '@/lib/auth/roles';
import { supabaseConfigured } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Paiement annulé · LA SUNSHINES', robots: { index: false } };

export default async function AnnuleePage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order } = await searchParams;
  const session = supabaseConfigured() ? await getSession() : null;
  if (!session) redirect('/connexion');
  const valid = order && /^SUN-\d{4,10}$/.test(order);

  return (
    <>
      <Nav />
      <main className="auth content-page">
        <PageHero eyebrow="Rien n’a été débité" title="Paiement annulé" />
        <div className="contact-form glass contact-form--done">
          <p>Ta réservation a été libérée. Tu peux reprendre ta commande quand tu veux, dans la limite des places disponibles.</p>
          <a className="btn btn--amber" href="/editions">Retour aux éditions</a>
        </div>
        {valid && <CancelPendingOrder orderNumber={order} />}
      </main>
      <Footer />
    </>
  );
}
