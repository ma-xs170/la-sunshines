import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import { getSession } from '@/lib/auth/roles';
import { supabaseConfigured } from '@/lib/supabase/config';

// Dépend de la session (cookies) : jamais prérendue statiquement.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mes billets · LA SUNSHINES',
  robots: { index: false },
};

// Phase 1 : page d'accueil des billets (état vide). La liste des commandes et
// des billets QR arrive avec les phases 3-4.
export default async function MesBilletsPage() {
  const session = supabaseConfigured() ? await getSession() : null;
  if (!session) redirect('/connexion?next=/compte/billets');

  return (
    <>
      <Nav />
      <main className="auth content-page">
        <PageHero eyebrow="Ta soirée t’attend" title="Mes billets" />
        <div className="contact-form glass contact-form--done">
          <h2>Aucun billet pour l’instant</h2>
          <p>Tes commandes et tes billets QR apparaîtront ici dès ta première réservation.</p>
          <a className="btn btn--amber" href="/editions">Voir les éditions</a>
        </div>
      </main>
      <Footer />
    </>
  );
}
