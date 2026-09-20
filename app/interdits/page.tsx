import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import Icon, { type IconName } from '@/components/Icon';

export const metadata: Metadata = {
  title: 'Règlement · LA SUNSHINES',
  description:
    'Règlement LA SUNSHINES : conditions d’accès, contrôle à l’entrée, tenue, interdits, comportement et remboursement pour les soirées 12–17 ans.',
};

type Section = { icon: IconName; title: string; rules: ReactNode[] };

const SECTIONS: Section[] = [
  {
    icon: 'ticket',
    title: '1. Conditions d’accès',
    rules: [
      'Un billet nominatif est obligatoire. Un billet = une entrée.',
      'La soirée est réservée aux 12–17 ans.',
      'Une pièce d’identité est obligatoire.',
      'Pas de ré-entrée après une sortie.',
      'Les portes ferment à l’heure indiquée au programme de la soirée : aucun accès après la fermeture, sans remboursement.',
      'Dépose et récupération encadrées : un adulte responsable doit venir chercher le/la mineur·e à l’heure de fin indiquée.',
      'L’organisation se réserve le droit de refuser l’accès à toute personne ne respectant pas le présent règlement, sans remboursement.',
      'En achetant un billet, tu acceptes ce règlement.',
    ],
  },
  {
    icon: 'shield',
    title: '2. Contrôle à l’entrée',
    rules: [
      'Présentation du billet (QR code, en PDF ou depuis ton compte) et d’une pièce d’identité.',
      'Un contrôle visuel des sacs est effectué à l’entrée. Une palpation de sécurité peut être réalisée par un agent de sécurité, avec ton accord. En cas de refus, l’accès est refusé, sans remboursement.',
      'Tout objet retiré à l’entrée est remis à la fin de l’événement. Les objets dangereux ou illicites ne sont pas restitués et peuvent être remis aux forces de l’ordre.',
    ],
  },
  {
    icon: 'shirt',
    title: '3. Tenue',
    rules: [
      'Short / bermuda : interdit.',
      'Chaussures fermées : obligatoire.',
      'Le dress code de chaque édition est indiqué sur la page de la soirée. Il est obligatoire : respecte les couleurs / le thème annoncés.',
      'Tenue correcte exigée : pas de torse nu, pas de tenue à caractère offensant.',
      'L’organisation peut refuser l’entrée en cas de non-respect du dress code.',
      'Sacs : les filles sont autorisées avec les sacs à main.',
    ],
  },
  {
    icon: 'close',
    title: '4. Interdits',
    rules: [
      'Alcool, tabac, cigarette électronique (vape), chicha et produits stupéfiants, à l’intérieur comme aux abords du lieu.',
      'Armes et objets dangereux ou tranchants, bouteilles en verre, pétards, fumigènes et lasers.',
      'Objets contondants et aérosols.',
      'Boissons et nourriture de l’extérieur.',
      'Sacs volumineux (une consigne peut être prévue selon le lieu).',
    ],
  },
  {
    icon: 'sparkles',
    title: '5. Comportement',
    rules: [
      'Respecte les autres et le personnel : aucune violence, insulte, moquerie, harcèlement ou discrimination ne sera toléré.',
      'Suis les consignes de l’équipe d’organisation et de sécurité.',
      'Tout comportement contraire au règlement peut entraîner une exclusion immédiate, sans remboursement, et le cas échéant un signalement aux forces de l’ordre et aux responsables légaux.',
      'Les dégradations du lieu ou du matériel engagent la responsabilité de leur auteur.',
    ],
  },
  {
    icon: 'bell',
    title: '6. Santé et sécurité',
    rules: [
      'Si tu ne te sens pas bien, ou si tu vois quelqu’un en difficulté, préviens immédiatement l’équipe.',
    ],
  },
  {
    icon: 'archive',
    title: '7. Objets personnels',
    rules: [
      'L’organisation n’est pas responsable des objets personnels perdus ou volés. Garde tes affaires avec toi.',
    ],
  },
  {
    icon: 'history',
    title: '8. Remboursement',
    rules: [
      <>
        Aucun remboursement en cas de refus d’accès ou d’exclusion pour non-respect du présent règlement. Voir aussi les{' '}
        <a href="/cgv">CGV</a> et la page <a href="/remboursement">Remboursement</a>.
      </>,
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
          title="Règlement"
          lead="Pour que la soirée reste une fête pour tout le monde, voici les règles à respecter."
        />

        <div className="rules-grid">
          {SECTIONS.map((s) => (
            <section className="rule-card glass" data-reveal key={s.title}>
              <span className="rule-card__icon">
                <Icon name={s.icon} />
              </span>
              <h2>{s.title}</h2>
              <ul className="rule-card__list">
                {s.rules.map((r, i) => (
                  <li key={i}>{r}</li>
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
