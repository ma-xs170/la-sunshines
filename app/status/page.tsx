import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
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
      <main className="status-page content-page">
        <PageHero
          eyebrow="En direct"
          title="État des services"
          lead={
            <>
              Disponibilité en temps réel des services LA SUNSHINES. La page
              revérifie automatiquement toutes les 60&nbsp;secondes.
            </>
          }
        />

        <StatusWidget />
      </main>
      <Footer />
    </>
  );
}
