import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import EditionsFilterable from '@/components/EditionsFilterable';
import { getAllEditions } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Les éditions · LA SUNSHINES',
  description:
    'Toutes les éditions LA SUNSHINES — la prochaine soirée et l’historique complet des éditions passées, avec line-up, dresscode et billetterie.',
};

export default function EditionsPage() {
  const editions = getAllEditions();

  return (
    <>
      <Nav />

      <main className="editions editions-page content-page">
        <PageHero
          eyebrow="La sauuuuceee"
          title="Les éditions"
          lead="La prochaine soirée et toutes les éditions passées. Filtre par « à venir » ou « passées »."
        />

        <EditionsFilterable editions={editions} />
      </main>

      <Footer />
    </>
  );
}
