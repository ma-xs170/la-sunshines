import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import ChangePasswordForm from '@/components/auth/ChangePasswordForm';
import { getSession } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Changer mon mot de passe · LA SUNSHINES', robots: { index: false, follow: false } };

export default async function ChangePasswordPage() {
  const s = await getSession();
  if (!s) redirect('/connexion?next=/compte/mot-de-passe');
  return (
    <>
      <Nav />
      <main className="content-page"><PageHero eyebrow="Mon compte" title="Changer mon mot de passe" lead="" /><ChangePasswordForm forced={s.mustChangePassword} /></main>
      <Footer />
    </>
  );
}
