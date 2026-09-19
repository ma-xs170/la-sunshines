import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import SignupForm from '@/components/auth/SignupForm';
import AuthUnavailable from '@/components/auth/AuthUnavailable';
import { getSession } from '@/lib/auth/roles';
import { safeNext } from '@/lib/auth/schemas';
import { googleAuthEnabled, supabaseConfigured } from '@/lib/supabase/config';

// Dépend de la session (cookies) : jamais prérendue statiquement.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Créer un compte · LA SUNSHINES',
  robots: { index: false },
};

export default async function InscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (supabaseConfigured() && (await getSession())) redirect(next);

  return (
    <>
      <Nav />
      <main className="auth content-page">
        <PageHero
          eyebrow="Rejoins la team"
          title="Créer un compte"
          lead="Un compte pour réserver tes places et retrouver tes billets QR sur ton téléphone."
        />
        {supabaseConfigured() ? (
          <SignupForm next={next} google={googleAuthEnabled()} />
        ) : (
          <AuthUnavailable />
        )}
      </main>
      <Footer />
    </>
  );
}
