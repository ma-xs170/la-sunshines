import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
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

      <main className="contact">
        <header className="section-head contact__head">
          <span className="script">On t’écoute</span>
          <h1>Nous contacter</h1>
          <p className="contact__lead">
            Billetterie, booking, partenariat, presse ou simple question : remplis le
            formulaire, on te répond au plus vite.
          </p>
        </header>

        <ContactForm />
      </main>

      <Footer />
    </>
  );
}
