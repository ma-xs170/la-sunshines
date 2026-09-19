import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import LoginForm from '@/components/auth/LoginForm';
import { getSession } from '@/lib/auth/roles';
import { safeNext } from '@/lib/auth/schemas';
import { googleAuthEnabled, supabaseConfigured } from '@/lib/supabase/config';
import AuthUnavailable from '@/components/auth/AuthUnavailable';

// Dépend de la session (cookies) : jamais prérendue statiquement.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Connexion · LA SUNSHINES',
  robots: { index: false },
};

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erreur?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (supabaseConfigured() && (await getSession())) redirect(next);

  return (
    <>
      <Nav />
      <main className="auth content-page">
        <PageHero eyebrow="Content de te revoir" title="Connexion" lead="Retrouve tes billets et tes commandes." />
        {!supabaseConfigured() ? (
          <AuthUnavailable />
        ) : (
          <>
            {sp.erreur === 'lien' && (
              <p className="auth-notice" role="alert">
                Ce lien est invalide ou a expiré. Reconnecte-toi, ou refais une demande de
                réinitialisation du mot de passe.
              </p>
            )}
            <LoginForm next={next} google={googleAuthEnabled()} />
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
