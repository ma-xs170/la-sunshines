import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
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

      <main className="editions editions-page">
        <header className="section-head">
          <span className="script">La sauuuuceee</span>
          <h1>Les éditions</h1>
          <p className="editions-page__lead">
            La prochaine soirée et toutes les éditions passées. Filtre par « à venir »
            ou « passées ».
          </p>
        </header>

        <EditionsFilterable editions={editions} />
      </main>

      <Footer />
    </>
  );
}
