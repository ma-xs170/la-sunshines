import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import Icon, { type IconName } from '@/components/Icon';

export const metadata: Metadata = {
  title: 'Interdits & conditions d’accès · LA SUNSHINES',
  description:
    'Règlement LA SUNSHINES : tenue obligatoire, objets interdits, contrôle à l’entrée, comportement et conditions d’accès pour les soirées 12–17 ans.',
};

type Section = { icon: IconName; title: string; intro?: string; rules: string[] };

// NOTE : texte réglementaire de base — à relire / ajuster avec l'organisation
// avant mise en ligne définitive.
const SECTIONS: Section[] = [
  {
    icon: 'shirt',
    title: 'Tenue obligatoire',
    intro: 'Un dresscode est communiqué pour chaque édition. Il est obligatoire.',
    rules: [
      'Respecter les couleurs / le thème annoncés pour la soirée.',
      'Tenue correcte exigée : pas de torse nu, pas de tenue à caractère offensant.',
      'Chaussures fermées recommandées.',
      'L’organisation peut refuser l’entrée en cas de non-respect du dresscode.',
    ],
  },
  {
    icon: 'close',
    title: 'Objets interdits',
    intro: 'Tout objet dangereux ou illicite est strictement interdit dans l’enceinte.',
    rules: [
      'Alcool, cigarettes, chicha et toute substance illicite.',
      'Objets tranchants, contondants ou dangereux, aérosols, pétards.',
      'Boissons et nourriture de l’extérieur.',
      'Sacs volumineux (une consigne peut être prévue selon le lieu).',
      'Tout objet retiré à l’entrée n’est pas restitué.',
    ],
  },
  {
    icon: 'shield',
    title: 'Contrôle à l’entrée',
    intro: 'L’accès est encadré et systématiquement contrôlé.',
    rules: [
      'Palpation de sécurité et contrôle visuel des sacs par un agent.',
      'Présentation du billet (Bizouk / Kiwol) et d’une pièce d’identité.',
      'Vérification de l’âge : la soirée est réservée aux 12–17 ans.',
      'Le refus du contrôle entraîne le refus d’accès, sans remboursement.',
    ],
  },
  {
    icon: 'sparkles',
    title: 'Comportement',
    intro: 'On vient pour faire la fête dans le respect de chacun.',
    rules: [
      'Aucune violence physique ou verbale, aucun harcèlement.',
      'Respect du staff, des agents de sécurité et des autres participants.',
      'Respect du lieu et du matériel.',
      'Tout comportement dangereux entraîne une exclusion immédiate, sans remboursement, et le cas échéant un signalement aux forces de l’ordre et aux responsables légaux.',
    ],
  },
  {
    icon: 'cake',
    title: 'Conditions d’accès',
    intro: 'Quelques règles pour que la soirée reste sûre pour tout le monde.',
    rules: [
      'Entrée réservée aux 12–17 ans, sur présentation d’un justificatif d’âge.',
      'Billet nominatif : une entrée par billet, pas de ré-entrée après sortie.',
      'Dépose et récupération encadrées : un adulte responsable doit venir chercher le/la mineur·e à l’heure de fin indiquée.',
      'L’organisation se réserve le droit de refuser l’accès à toute personne ne respectant pas le présent règlement.',
    ],
  },
];

export default function InterditsPage() {
  return (
    <>
      <Nav />

      <main className="rules content-page">
        <PageHero
          eyebrow="Le cadre"
          title="Interdits & accès"
          lead="Pour que LA SUNSHINES reste une soirée sûre et encadrée pour les 12–17 ans, voici ce qu’il faut savoir avant de venir. En achetant un billet, tu acceptes ce règlement."
        />

        <div className="rules-grid">
          {SECTIONS.map((s) => (
            <section className="rule-card glass" data-reveal key={s.title}>
              <span className="rule-card__icon">
                <Icon name={s.icon} />
              </span>
              <h2>{s.title}</h2>
              {s.intro && <p className="rule-card__intro">{s.intro}</p>}
              <ul className="rule-card__list">
                {s.rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="rules__foot">
          Une question sur l’accès ou une situation particulière ?{' '}
          <a href="/contact">Contacte l’organisation</a>.
        </p>
      </main>

      <Footer />
    </>
  );
}
