import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import ProfileForm from '@/components/auth/ProfileForm';
import LogoutButton from '@/components/auth/LogoutButton';
import { getSession } from '@/lib/auth/roles';
import { supabaseConfigured } from '@/lib/supabase/config';

// Dépend de la session (cookies) : jamais prérendue statiquement.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mon compte · LA SUNSHINES',
  robots: { index: false },
};

export default async function ComptePage({
  searchParams,
}: {
  searchParams: Promise<{ mdp?: string }>;
}) {
  const sp = await searchParams;
  const session = supabaseConfigured() ? await getSession() : null;
  if (!session) redirect('/connexion?next=/compte');

  const { first_name, last_name, phone } = session.profile;
  const incomplete = !first_name || !last_name || !phone;

  return (
    <>
      <Nav />
      <main className="auth content-page">
        <PageHero
          eyebrow={first_name ? `Salut ${first_name}` : 'Bienvenue'}
          title="Mon compte"
        />
        {sp.mdp === 'ok' && (
          <p className="auth-ok" role="status">Mot de passe mis à jour.</p>
        )}
        {incomplete && (
          <p className="auth-notice" role="status">
            Complète ton profil (prénom, nom, téléphone) : il servira à tes prochaines commandes.
          </p>
        )}
        <ProfileForm email={session.email} initial={{ first_name, last_name, phone }} />
        <div className="auth-actions">
          <a className="btn btn--outline" href="/compte/billets">Mes billets</a>
          <LogoutButton />
        </div>
      </main>
      <Footer />
    </>
  );
}
