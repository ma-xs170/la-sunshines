import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';

export const metadata: Metadata = {
  title: 'Politique de confidentialité · LA SUNSHINES',
  description:
    'Comment LA SUNSHINES collecte et traite les données personnelles : formulaire de contact, cookies, billetterie Bizouk, durées de conservation et droits des personnes.',
  robots: { index: true, follow: true },
};

const UPDATED = '28 août 2026';
const CONTACT_EMAIL = 'themouv2.0971@gmail.com';

export default function PrivacyPage() {
  return (
    <>
      <Nav />

      <main className="legal content-page">
        <PageHero
          eyebrow="Vie privée"
          title="Politique de confidentialité"
          lead={`Dernière mise à jour : ${UPDATED}`}
        />

        <div className="legal__body glass">
          <p>
            La présente politique explique quelles données personnelles sont
            collectées sur le site LA SUNSHINES, dans quel but, combien de temps
            elles sont conservées et comment exercer vos droits. Le site est un
            site vitrine : il ne nécessite aucune création de compte.
          </p>

          <h2>1. Responsable du traitement</h2>
          <p>
            Le responsable du traitement est l’éditeur du site,{' '}
            <strong>LAWCY MUSIC</strong> (coordonnées complètes sur la page{' '}
            <a href="/mentions-legales">Mentions légales</a>). Les soirées LA
            SUNSHINES sont organisées par l’association THE MOUV, qui reçoit les
            messages envoyés via le formulaire de contact. Pour toute question
            relative à vos données :{' '}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>

          <h2>2. Données que nous collectons</h2>
          <ul>
            <li>
              <strong>Formulaire de contact</strong> : nom, adresse email, sujet
              et contenu du message que vous nous envoyez. Ces informations sont
              transmises par email à l’organisation.
            </li>
            <li>
              <strong>Cookie de consentement</strong> : lorsque vous cliquez sur
              « Accepter » ou « Refuser » dans le bandeau cookies, un cookie
              technique (<code>sun_cookie_consent</code>) est enregistré pour
              mémoriser votre choix pendant 6 mois.
            </li>
            <li>
              <strong>Mesure d’audience</strong> : si vous l’acceptez via le
              bandeau, des statistiques de fréquentation agrégées peuvent être
              collectées. Aucune mesure d’audience n’est active tant que vous
              n’avez pas donné votre accord.
            </li>
          </ul>
          <p>
            Nous ne collectons aucune donnée sensible et ne vous demandons jamais
            d’informations bancaires sur ce site.
          </p>

          <h2>3. Pourquoi nous utilisons ces données</h2>
          <ul>
            <li>Répondre aux demandes envoyées via le formulaire de contact.</li>
            <li>Mémoriser votre choix concernant les cookies.</li>
            <li>
              Mesurer de façon agrégée la fréquentation du site pour l’améliorer
              (uniquement avec votre consentement).
            </li>
          </ul>

          <h2>4. Base légale</h2>
          <p>
            Le traitement des messages de contact repose sur notre intérêt
            légitime à répondre à vos sollicitations. Le dépôt de cookies non
            strictement nécessaires et la mesure d’audience reposent sur votre
            consentement, que vous pouvez retirer à tout moment.
          </p>

          <h2>5. Destinataires et sous-traitants</h2>
          <p>
            Vos données ne sont ni vendues, ni louées, ni transmises à des tiers
            à des fins commerciales. Elles sont uniquement accessibles à
            l’organisation LA SUNSHINES. Nous faisons appel à des prestataires
            techniques qui agissent pour notre compte :
          </p>
          <ul>
            <li>
              <strong>Envoi des emails du formulaire</strong> : service Resend
              (resend.com), qui achemine le message jusqu’à notre boîte email.
            </li>
            <li>
              <strong>Hébergement du site</strong> : voir la page{' '}
              <a href="/mentions-legales">Mentions légales</a>.
            </li>
          </ul>

          <h2>6. Billetterie (Bizouk)</h2>
          <p>
            L’achat des billets est géré par un prestataire indépendant,{' '}
            <a href="https://www.bizouk.com" target="_blank" rel="noopener noreferrer">
              Bizouk
            </a>
            . Lorsque vous êtes redirigé·e vers Bizouk (ou qu’un module Bizouk est
            affiché sur une page événement), les données que vous y saisissez sont
            collectées et traitées par Bizouk selon sa propre politique de
            confidentialité. LA SUNSHINES n’a pas accès à vos informations de
            paiement.
          </p>

          <h2>7. Durée de conservation</h2>
          <ul>
            <li>
              <strong>Messages de contact</strong> : conservés le temps de
              traiter votre demande, puis jusqu’à 12 mois à des fins de suivi,
              avant suppression.
            </li>
            <li>
              <strong>Cookie de consentement</strong> : 6 mois, puis le bandeau
              vous est reproposé.
            </li>
          </ul>

          <h2>8. Vos droits</h2>
          <p>
            Conformément au RGPD et à la loi « Informatique et Libertés », vous
            disposez d’un droit d’accès, de rectification, d’effacement,
            d’opposition et de limitation sur vos données. Vous pouvez les exercer
            en écrivant à <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            Vous pouvez également introduire une réclamation auprès de la CNIL
            (www.cnil.fr).
          </p>

          <h2>9. Sécurité</h2>
          <p>
            Nous mettons en œuvre des mesures raisonnables pour protéger vos
            données contre la perte, l’accès non autorisé ou la divulgation. Les
            échanges avec le site sont chiffrés (HTTPS).
          </p>

          <h2>10. Modifications</h2>
          <p>
            Cette politique peut être mise à jour. La date de dernière mise à jour
            figure en haut de page. En cas de changement important, une
            information sera affichée sur le site.
          </p>
        </div>
      </main>

      <Footer />
    </>
  );
}
