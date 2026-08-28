import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
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

      <main className="infos-page">
        <Infos nextVenue={nextEdition?.venue ?? null} />
      </main>

      <Footer />
    </>
  );
}
