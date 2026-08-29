import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import Infos from '@/components/Infos';
import { getNextEdition } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Infos pratiques · LA SUNSHINES',
  description:
    'Tout ce qu’il faut savoir avant de venir à une soirée LA SUNSHINES : lieu, âge, billetterie, encadrement, tenue et accès.',
};

export default function InfosPage() {
  const nextEdition = getNextEdition();

  return (
    <>
      <Nav />

      <main className="infos-page content-page">
        <PageHero
          eyebrow="Infos"
          title="Avant de venir."
          lead="On garde l’expérience simple : accès encadré, une soirée claire, et tout ce qu’il faut pour que les ados profitent en toute sécurité."
        />
        <Infos nextVenue={nextEdition?.venue ?? null} />
      </main>

      <Footer />
    </>
  );
}
