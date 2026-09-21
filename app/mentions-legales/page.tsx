import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import { getTicketingSettings } from '@/lib/ticketing/settings';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Mentions légales · LA SUNSHINES',
  description:
    'Mentions légales du site LA SUNSHINES : éditeur (LAWCY MUSIC), organisateur des événements (THE MOUV), hébergeur, propriété intellectuelle.',
  robots: { index: true, follow: true },
};

const CONTACT_EMAIL = 'themouv2.0971@gmail.com';

export default async function LegalNoticePage() {
  // Le texte « Billetterie » suit le réglage : Bizouk tant que les ventes internes ne sont pas ouvertes.
  const native = (await getTicketingSettings(false)).mode === 'native';
  return (
    <>
      <Nav />

      <main className="legal content-page">
        <PageHero eyebrow="Le cadre légal" title="Mentions légales" />

        <div className="legal__body glass">
          <h2>Éditeur du site</h2>
          <p>Le présent site est édité par&nbsp;:</p>
          <ul>
            <li>Dénomination : <strong>LAWCY MUSIC</strong></li>
            <li>SIRET : <strong>107 145 534 00015</strong></li>
            <li>
              Adresse : Direction de Tabanon, 2476 Route de Bel Air Desrozières,
              97170 Petit-Bourg
            </li>
            <li>Responsable de la publication : <strong>{native ? 'Mathis [NOM DE FAMILLE — À COMPLÉTER]' : 'Mathis'}</strong></li>
            <li>Contact : <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></li>
          </ul>

          <h2>Organisateur des événements</h2>
          <p>
            Les soirées LA SUNSHINES sont organisées par l’association{' '}
            <strong>THE MOUV</strong>. LAWCY MUSIC édite ce site&nbsp;;
            l’organisation des événements et la vente des billets relèvent de THE MOUV.
          </p>
          <ul>
            <li>Dénomination : <strong>THE MOUV</strong></li>
            <li>Forme juridique : association loi 1901</li>
            <li>SIRET : <strong>106 659 956 00010</strong></li>
            <li>Adresse : 1 Morne Caruel, Cité Deboisvieux, 97139 Les Abymes</li>
          </ul>

          <h2>Hébergement</h2>
          <p>Le site est hébergé par&nbsp;:</p>
          <ul>
            <li>
              <strong>Vercel Inc.</strong> — société de droit américain
            </li>
            <li>
              Adresse : 440&nbsp;N&nbsp;Barranca&nbsp;Ave&nbsp;#4133, Covina,
              CA&nbsp;91723, États-Unis
            </li>
            <li>
              Site :{' '}
              <a href="https://vercel.com" target="_blank" rel="noopener noreferrer">
                vercel.com
              </a>
            </li>
          </ul>
          {native && (
            <>
              <p>
                Les comptes utilisateurs, les commandes et les billets sont stockés dans une base de données
                fournie par <strong>Supabase</strong> (région&nbsp;: [RÉGION DU PROJET SUPABASE — À COMPLÉTER]).
                Le paiement est assuré par <strong>Stripe</strong> et l’envoi des emails transactionnels par{' '}
                <strong>Resend</strong>. Le détail figure dans la{' '}
                <a href="/politique-de-confidentialite">Politique de confidentialité</a>.
              </p>
            </>
          )}

          <h2>Billetterie</h2>
          {native ? (
            <>
              <p>
                Les billets des soirées LA SUNSHINES sont vendus par l’association <strong>THE MOUV</strong> via la
                billetterie en ligne de ce site (paiement sécurisé par Stripe). Les conditions de vente figurent dans
                les <a href="/cgv">Conditions générales de vente</a> et la{' '}
                <a href="/remboursement">politique de remboursement</a>. TVA non applicable, article 293&nbsp;B du CGI.
              </p>
              <p>
                Médiateur de la consommation&nbsp;: [COORDONNÉES DU MÉDIATEUR — À COMPLÉTER].
              </p>
            </>
          ) : (
            <p>
              La vente de billets est assurée par un prestataire tiers,{' '}
              <a href="https://www.bizouk.com" target="_blank" rel="noopener noreferrer">
                Bizouk
              </a>
              . Les conditions de vente et le traitement des données liés à l’achat
              de billets relèvent de Bizouk.
            </p>
          )}

          <h2>Propriété intellectuelle</h2>
          <p>
            L’ensemble des éléments du site (structure, textes, identité visuelle,
            logo « LA SUNSHINES ») est la propriété de l’éditeur, sauf mention
            contraire. Les affiches et visuels des éditions passées restent la
            propriété de leurs auteurs respectifs et sont reproduits à titre
            d’archive. Toute reproduction sans autorisation est interdite.
          </p>

          <h2>Données personnelles</h2>
          <p>
            Le traitement des données personnelles collectées via le site est
            décrit dans la{' '}
            <a href="/politique-de-confidentialite">Politique de confidentialité</a>.
          </p>

          <h2>Cookies</h2>
          <p>
            Le site utilise un cookie de consentement et, sous réserve de votre
            accord, des cookies de mesure d’audience. Vous gérez votre choix via
            le bandeau affiché lors de votre première visite (choix conservé
            6&nbsp;mois).
          </p>

          <h2>Droit applicable</h2>
          <p>
            Le présent site et ses mentions légales sont soumis au droit
            français. En cas de litige, et à défaut de résolution amiable, les
            tribunaux français seront compétents.
          </p>
        </div>
      </main>

      <Footer />
    </>
  );
}
