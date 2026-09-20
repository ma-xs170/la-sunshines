import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import { getTicketingSettings } from '@/lib/ticketing/settings';
import { supabaseConfigured } from '@/lib/supabase/config';
import { supabaseAdminConfigured } from '@/lib/supabase/admin';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Politique de confidentialité · LA SUNSHINES',
  description:
    'Comment LA SUNSHINES collecte et traite les données personnelles : formulaire de contact, cookies, comptes, billetterie, assistant du site, durées de conservation et droits des personnes.',
  robots: { index: true, follow: true },
};

const UPDATED = '21 septembre 2026';
const CONTACT_EMAIL = 'themouv2.0971@gmail.com';

export default async function PrivacyPage() {
  const native = (await getTicketingSettings(false)).mode === 'native';
  // Les comptes peuvent exister dès que Supabase est branché, même avant l’ouverture des ventes.
  const accounts = native || supabaseConfigured();
  // L'assistant n'existe que si la clé Mistral est configurée.
  const assistant = Boolean(process.env.MISTRAL_API_KEY);
  // Abonnements aux artistes, emails de connexion et certifications : base privée (Supabase), jamais dans le code source public.
  const artistsData = supabaseAdminConfigured();
  const certification = artistsData && Boolean(process.env.BLOB_READ_WRITE_TOKEN);
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
            elles sont conservées et comment exercer vos droits.{' '}
            {accounts
              ? 'La consultation du site ne nécessite aucun compte ; un compte est nécessaire pour acheter des billets en ligne.'
              : 'Le site ne nécessite aucune création de compte.'}
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
          {artistsData && (
            <ul>
              <li>
                <strong>Abonnement aux annonces d’un artiste</strong> : adresse email et artiste suivi, avec votre
                consentement (case à cocher). Vous recevez un email lorsque cet artiste est annoncé au line-up d’une
                soirée ; chaque email contient un lien de désabonnement en un clic.
              </li>
              <li>
                <strong>Espace artiste</strong> : l’adresse email d’un artiste sert uniquement à lui envoyer ses liens
                de connexion (à usage unique, valables 30 minutes). Elle n’est jamais affichée publiquement.
              </li>
              {certification && (
                <li>
                  <strong>Certification d’une page artiste</strong> : nom, adresse email et copie d’une pièce
                  d’identité. La pièce est stockée dans un espace privé, consultée uniquement par l’équipe, et
                  <strong> supprimée dès que la décision est prise</strong> ; seul le fait que la page est « certifiée »
                  est conservé.
                </li>
              )}
            </ul>
          )}
          {assistant && (
            <ul>
              <li>
                <strong>Assistant du site</strong> : les messages que vous écrivez dans l’assistant sont envoyés à
                notre prestataire d’intelligence artificielle, <strong>Mistral AI</strong> (France), pour
                générer la réponse. Nous ne les enregistrons pas. N’y saisissez aucune donnée sensible. Si vous
                demandez à être recontacté·e, l’assistant enregistre une <strong>demande de support</strong> :
                nom, adresse email, numéro de téléphone (facultatif), motif et résumé de votre demande.
              </li>
            </ul>
          )}
          {accounts && (
            <ul>
              <li>
                <strong>Compte</strong> : adresse email, nom, prénom, numéro de téléphone, mot de passe
                (jamais stocké en clair) ou identifiant de connexion Google si vous choisissez cette option.
              </li>
              <li>
                <strong>Commandes et billets</strong> : contenu de la commande, montant, statut du paiement,
                <strong> nom et prénom de chaque participant</strong> (qui peuvent être mineurs), code QR du billet,
                date et heure du contrôle du billet à l’entrée, consentements donnés lors de l’achat (CGV, politique
                de remboursement, « J’ai 18 ans ou l’autorisation de mon représentant légal »).
              </li>
            </ul>
          )}
          <p>
            Nous ne collectons aucune donnée sensible.{' '}
            {accounts
              ? 'Nous ne recevons jamais vos numéros de carte bancaire : le paiement est traité directement par Stripe.'
              : 'Nous ne vous demandons jamais d’informations bancaires sur ce site.'}
          </p>

          <h2>3. Pourquoi nous utilisons ces données</h2>
          <ul>
            <li>Répondre aux demandes envoyées via le formulaire de contact{assistant ? ' ou enregistrées par l’assistant du site' : ''}.</li>
            {accounts && (
              <>
                <li>Créer et gérer votre compte, traiter et confirmer vos commandes, émettre vos billets et vous les envoyer par email.</li>
                <li>Contrôler les billets à l’entrée des événements et assurer la sécurité (un billet n’est valable qu’une fois).</li>
                <li>Gérer les remboursements, prévenir la fraude, respecter nos obligations comptables et légales.</li>
              </>
            )}
            <li>Mémoriser votre choix concernant les cookies.</li>
            <li>
              Mesurer de façon agrégée la fréquentation du site pour l’améliorer
              (uniquement avec votre consentement).
            </li>
          </ul>

          <h2>4. Base légale</h2>
          <p>
            Le traitement des messages de contact repose sur notre intérêt
            légitime à répondre à vos sollicitations.{' '}
            {artistsData &&
              'L’abonnement aux annonces d’un artiste repose sur votre consentement, retirable en un clic ; la vérification d’une page artiste, sur la demande de l’artiste. '}
            {accounts &&
              'La gestion du compte, des commandes et des billets repose sur l’exécution du contrat conclu avec vous ; la conservation des pièces de vente, sur une obligation légale ; le contrôle à l’entrée et la lutte contre la fraude, sur notre intérêt légitime. '}
            Le dépôt de cookies non
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
              <strong>Envoi des emails</strong> (formulaire de contact
              {assistant ? ', demandes de support' : ''}
              {accounts ? ', confirmations de commande, billets, réinitialisation de mot de passe' : ''}) : service Resend
              (resend.com).
            </li>
            <li>
              <strong>Hébergement du site</strong> : Vercel (voir la page{' '}
              <a href="/mentions-legales">Mentions légales</a>).
            </li>
            {assistant && (
              <li>
                <strong>Assistant du site</strong> : Mistral AI (Paris, France), qui reçoit les messages saisis dans
                l’assistant pour produire les réponses, selon ses propres conditions de traitement.
              </li>
            )}
            {native && (
              <li>
                <strong>Organisateurs des événements</strong> : l’organisateur d’un événement (aujourd’hui l’association THE MOUV)
                reçoit, pour gérer cet événement, les données des participants de <strong>ses</strong> événements : nom, prénom,
                adresse email et numéro de téléphone de l’acheteur, tarif, référence du billet, statut et entrée. Il peut renvoyer un
                billet, exporter la liste et envoyer des messages d’information liés à l’événement (jamais de promotion). Chaque
                consultation, export et envoi est enregistré dans un journal ; un organisateur ne voit jamais les événements d’un autre.
              </li>
            )}
            {accounts && (
              <>
                <li>
                  <strong>Base de données et authentification</strong> : Supabase (supabase.com){native ? ' — région : [RÉGION DU PROJET SUPABASE — À COMPLÉTER]' : ''}.
                </li>
                <li>
                  <strong>Paiement</strong> : Stripe (stripe.com). Stripe traite vos données de paiement en tant que
                  responsable de traitement pour ses propres obligations (lutte contre la fraude, obligations
                  bancaires) ; nous ne recevons que la confirmation du paiement.
                </li>
              </>
            )}
          </ul>
          {accounts && (
            <p>
              Certains de ces prestataires sont établis hors de l’Union européenne (États-Unis notamment). Les
              transferts reposent sur les mécanismes prévus par le RGPD (notamment les clauses contractuelles types
              de la Commission européenne).
            </p>
          )}

          <h2>6. Billetterie</h2>
          {native ? (
            <p>
              Les billets sont vendus par l’association THE MOUV via la billetterie de ce site. Le paiement est
              réalisé sur la page sécurisée de Stripe. Les conditions figurent dans les{' '}
              <a href="/cgv">CGV</a> et la <a href="/remboursement">politique de remboursement</a>. Les achats
              sont réalisés par une personne majeure ou avec l’autorisation de son représentant légal ; les
              données des participants mineurs ne sont utilisées que pour la gestion et le contrôle de leurs billets.
            </p>
          ) : (
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
          )}

          <h2>7. Durée de conservation</h2>
          <ul>
            <li>
              <strong>Messages de contact</strong> : conservés le temps de
              traiter votre demande. Vous pouvez en demander la suppression à
              tout moment.
            </li>
            {native && (
              <li>
                <strong>Journal des consultations, exports et envois des organisateurs</strong> : conservé avec les données de billetterie.
              </li>
            )}
            {artistsData && (
              <li>
                <strong>Abonnements aux artistes</strong> : jusqu’à votre désabonnement.{' '}
                <strong>Emails de connexion des artistes</strong> : tant que la page artiste existe.
                {certification && ' Pièces d’identité : supprimées dès la décision de l’équipe.'}
              </li>
            )}
            {assistant && (
              <li>
                <strong>Demandes de support de l’assistant</strong> :{' '}
                {accounts
                  ? '12 mois, puis suppression automatique (contrôle quotidien). Elles sont enregistrées dans une base privée, non accessible au public. Une copie est aussi envoyée par email à l’organisation ; cette copie est supprimée sur demande.'
                  : 'transmises par email à l’organisation, conservées le temps de traiter votre demande ; suppression sur demande.'}{' '}
                Les conversations avec l’assistant ne sont pas enregistrées par le site.
              </li>
            )}
            {accounts && (
              <>
                <li>
                  <strong>Compte</strong> : conservé tant que vous ne demandez pas sa suppression. Vous pouvez la
                  demander à tout moment par email : le compte et le profil sont alors supprimés, et vos commandes
                  restent conservées sans lien avec un compte.
                </li>
                <li>
                  <strong>Commandes, billets et données des participants</strong> : conservés au titre des
                  obligations comptables (10 ans pour les pièces de vente), y compris l’historique de contrôle du
                  billet à l’entrée. Ils ne sont pas supprimés automatiquement avant ce délai.
                </li>
              </>
            )}
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
