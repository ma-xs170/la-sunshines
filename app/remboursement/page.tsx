import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import { getTicketingSettings } from '@/lib/ticketing/settings';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Politique de remboursement · LA SUNSHINES', robots: { index: false } };

export default async function RemboursementPage() {
  if ((await getTicketingSettings(false)).mode !== 'native') notFound();
  return (
    <>
      <Nav />
      <main className="legal content-page">
        <PageHero title="Politique de remboursement" lead="Billetterie en ligne LA SUNSHINES" />
        <section className="legal__body">
          <h2>Billets non remboursables</h2>
          <p>Sauf cas prévus ci-dessous, un billet acheté n’est ni remboursable ni échangeable.</p>
          <h2>Remboursement intégral</h2>
          <ul>
            <li>Annulation de l’événement par l’organisateur : remboursement du prix des billets <strong>et des frais de service</strong>.</li>
            <li>Places épuisées pendant ton paiement : la commande est annulée et remboursée automatiquement <strong>en totalité</strong>, frais compris.</li>
            <li>Double paiement ou erreur de notre part : remboursement sur demande.</li>
          </ul>
          <h2>Demande de remboursement</h2>
          <p>Écris-nous via la page <a href="/contact">Contact</a> en indiquant ton numéro de commande. Le remboursement est effectué sur le moyen de paiement utilisé ; il apparaît généralement sous 5 à 10 jours ouvrés selon ta banque.</p>
          <h2>Remboursement partiel</h2>
          <p>Si une partie seulement de ta commande est concernée, seuls les billets concernés sont remboursés, et annulés.</p>
        </section>
      </main>
      <Footer />
    </>
  );
}
