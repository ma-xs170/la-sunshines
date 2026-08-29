import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import ContactForm from '@/components/ContactForm';

export const metadata: Metadata = {
  title: 'Nous contacter · LA SUNSHINES',
  description:
    'Une question sur une soirée LA SUNSHINES, la billetterie, le booking ou un partenariat ? Écris-nous.',
};

export default function ContactPage() {
  return (
    <>
      <Nav />

      <main className="contact content-page">
        <PageHero
          eyebrow="On t’écoute"
          title="Nous contacter"
          lead="Billetterie, booking, partenariat, presse ou simple question : remplis le formulaire, on te répond au plus vite."
        />

        <ContactForm />
      </main>

      <Footer />
    </>
  );
}
