import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import { getTicketingSettings } from '@/lib/ticketing/settings';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Conditions générales de vente · LA SUNSHINES', robots: { index: false } };

// Invisible (404) tant que la billetterie interne n'est pas activée.
export default async function CgvPage() {
  if ((await getTicketingSettings(false)).mode !== 'native') notFound();
  return (
    <>
      <Nav />
      <main className="legal content-page">
        <PageHero title="Conditions générales de vente" lead="Billetterie en ligne LA SUNSHINES" />
        <section className="legal__body">
          <h2>1. Vendeur</h2>
          <p>
            Les billets sont vendus par l’association <strong>THE MOUV</strong> (association loi 1901), organisatrice des soirées LA SUNSHINES —
            SIRET 104 253 943 00013 — 1 Morne Caruel, Cité Deboisvieux, 97139 Les Abymes. Contact : <a href="mailto:themouv2.0971@gmail.com">themouv2.0971@gmail.com</a>{' '}
            ou page <a href="/contact">Contact</a>. Le site est édité par LAWCY MUSIC (voir les <a href="/mentions-legales">Mentions légales</a>).
          </p>
          <h2>2. Prix et TVA</h2>
          <p>Les prix sont indiqués en euros, toutes taxes comprises. <strong>TVA non applicable, article 293 B du CGI.</strong> Des frais de service peuvent s’ajouter au prix ; ils sont affichés avant le paiement.</p>
          <h2>3. Commande et paiement</h2>
          <p>La réservation des places est maintenue 15 minutes pendant le paiement. Le paiement est traité par Stripe (carte bancaire) ; l’organisateur n’a pas accès aux numéros de carte. La commande est confirmée à la réception du paiement : un email récapitulatif est envoyé et les billets sont disponibles dans « Mes billets ». Si les places sont épuisées pendant un paiement tardif, la commande est annulée et remboursée intégralement.</p>
          <h2>4. Billets</h2>
          <p>Chaque billet est nominatif, porte un QR code unique et n’est valable qu’une seule fois, pour l’événement et le tarif indiqués. Le QR code ne doit pas être partagé : le premier scan à l’entrée est le seul valable.</p>
          <h2>5. Mineurs</h2>
          <p>Les événements s’adressent à un public de 12 à 17 ans. L’acheteur déclare être le représentant légal du ou des participants mineurs, ou disposer de leur autorisation parentale. Le règlement de l’événement s’applique.</p>
          <h2>6. Rétractation</h2>
          <p>Conformément à l’article L221-28 12° du Code de la consommation, le droit de rétractation ne s’applique pas aux prestations de loisirs fournies à une date déterminée.</p>
          <h2>7. Annulation ou report</h2>
          <p>En cas d’annulation de l’événement par l’organisateur, les billets sont remboursés. Voir la <a href="/remboursement">politique de remboursement</a>.</p>
          <h2>8. Données personnelles</h2>
          <p>Voir la <a href="/politique-de-confidentialite">politique de confidentialité</a>.</p>
          <h2>9. Litiges</h2>
          <p>Droit français. En cas de litige, contacte-nous d’abord ; à défaut d’accord, tu peux recourir à un médiateur de la consommation : [COORDONNÉES DU MÉDIATEUR — À COMPLÉTER].</p>
        </section>
      </main>
      <Footer />
    </>
  );
}
