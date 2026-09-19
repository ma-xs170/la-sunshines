import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import ResetForm from '@/components/auth/ResetForm';
import { getSession } from '@/lib/auth/roles';
import { supabaseConfigured } from '@/lib/supabase/config';

// Dépend de la session (cookies) : jamais prérendue statiquement.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Nouveau mot de passe · LA SUNSHINES',
  robots: { index: false },
};

export default async function ReinitialiserPage() {
  // On n'arrive ici qu'avec la session ouverte par le lien de l'email.
  if (!supabaseConfigured() || !(await getSession())) {
    redirect('/connexion?erreur=lien');
  }
  return (
    <>
      <Nav />
      <main className="auth content-page">
        <PageHero eyebrow="Presque fini" title="Nouveau mot de passe" />
        <ResetForm />
      </main>
      <Footer />
    </>
  );
}
