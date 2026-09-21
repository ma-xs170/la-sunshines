import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import SignupWizard from '@/components/organizer/SignupWizard';
import AuthUnavailable from '@/components/auth/AuthUnavailable';
import { getSession } from '@/lib/auth/roles';
import { supabaseConfigured } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Devenir organisateur · LA SUNSHINES', robots: { index: false, follow: false } };

// Formulaire d'inscription d'une organisation (compte connecté requis). L'organisation est créée EN ATTENTE ; un admin l'approuve après lecture des pièces.
export default async function BecomeOrganizer() {
  if (!supabaseConfigured()) return (<><Nav /><main className="content-page"><AuthUnavailable /></main><Footer /></>);
  const s = await getSession();
  if (!s) redirect('/connexion?next=/devenir-organisateur');
  return (
    <>
      <Nav />
      <main className="content-page">
        <PageHero eyebrow="Espace organisateur" title="Devenir organisateur" lead="Dépose le dossier de ta structure : l’équipe le vérifie avant d’ouvrir la création d’évènements." />
        <SignupWizard email={s.email} firstName={s.profile.first_name} />
      </main>
      <Footer />
    </>
  );
}
