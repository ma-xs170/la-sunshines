import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import ForgotForm from '@/components/auth/ForgotForm';
import AuthUnavailable from '@/components/auth/AuthUnavailable';
import { supabaseConfigured } from '@/lib/supabase/config';

// Dépend de la session (cookies) : jamais prérendue statiquement.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mot de passe oublié · LA SUNSHINES',
  robots: { index: false },
};

export default function MotDePasseOubliePage() {
  return (
    <>
      <Nav />
      <main className="auth content-page">
        <PageHero
          eyebrow="Pas de panique"
          title="Mot de passe oublié"
          lead="Indique ton email : on t’envoie un lien pour en choisir un nouveau."
        />
        {supabaseConfigured() ? <ForgotForm /> : <AuthUnavailable />}
      </main>
      <Footer />
    </>
  );
}
