import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import StatusWidget from '@/components/StatusWidget';

export const metadata: Metadata = {
  title: 'État des services · LA SUNSHINES',
  description:
    'Disponibilité en temps réel des services LA SUNSHINES : site, billetterie Bizouk, assistant IA et préventes Kiwol.',
  robots: { index: false, follow: false },
};

export default function StatusPage() {
  return (
    <>
      <Nav />
      <main className="status-page">
        <header className="status-page__head">
          <p className="script">En direct</p>
          <h1>État des services</h1>
          <p className="status-page__lead">
            Disponibilité en temps réel des services LA SUNSHINES. La page
            revérifie automatiquement toutes les 60&nbsp;secondes.
          </p>
        </header>

        <StatusWidget />
      </main>
      <Footer />
    </>
  );
}
