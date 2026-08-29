import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';

export const metadata: Metadata = {
  title: 'Mentions légales · LA SUNSHINES',
  description:
    'Mentions légales du site LA SUNSHINES : éditeur (LAWCY MUSIC), organisateur des événements (THE MOUV), hébergeur, propriété intellectuelle.',
  robots: { index: true, follow: true },
};

const CONTACT_EMAIL = 'themouv2.0971@gmail.com';

export default function LegalNoticePage() {
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
            <li>Responsable de la publication : <strong>Mathis</strong></li>
            <li>Contact : <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></li>
          </ul>

          <h2>Organisateur des événements</h2>
          <p>
            Les soirées LA SUNSHINES sont organisées par l’association{' '}
            <strong>THE MOUV</strong>. LAWCY MUSIC édite ce site vitrine&nbsp;;
            l’organisation des événements et la billetterie relèvent de THE MOUV.
          </p>
          <ul>
            <li>Dénomination : <strong>THE MOUV</strong></li>
            <li>Forme juridique : association loi 1901</li>
            <li>SIRET : <strong>104 253 943 00013</strong></li>
            <li>Adresse : 1 Morne Caruel, Cité Deboisvieux, 97139 Les Abymes</li>
          </ul>

          <h2>Hébergement</h2>
          <p>Le site est hébergé par&nbsp;:</p>
          <ul>
            <li>
              <strong>HOSTINGER, UAB</strong> — société de droit lituanien, code
              302710386
            </li>
            <li>
              Siège : Švitrigailos str. 34, LT-03230 Vilnius, Lituanie
            </li>
            <li>
              Site :{' '}
              <a href="https://www.hostinger.fr" target="_blank" rel="noopener noreferrer">
                hostinger.fr
              </a>
            </li>
          </ul>

          <h2>Billetterie</h2>
          <p>
            La vente de billets est assurée par un prestataire tiers,{' '}
            <a href="https://www.bizouk.com" target="_blank" rel="noopener noreferrer">
              Bizouk
            </a>
            . Les conditions de vente et le traitement des données liés à l’achat
            de billets relèvent de Bizouk.
          </p>

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
