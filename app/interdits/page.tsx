import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import Icon, { type IconName } from '@/components/Icon';

export const metadata: Metadata = {
  title: 'Règlement · LA SUNSHINES',
  description:
    'Règlement LA SUNSHINES : à l’entrée, tenue, interdits, respect et refus d’accès pour les soirées 12–17 ans.',
};

type Section = { icon: IconName; title: string; rules: ReactNode[] };

const SECTIONS: Section[] = [
  {
    icon: 'shield',
    title: 'À l’entrée',
    rules: [
      'Billet (QR code) et pièce d’identité obligatoires.',
      'Contrôle de sécurité à l’entrée, avec ton accord.',
      'Tout objet retiré à l’entrée est remis à la fin de l’événement.',
      'Aucune entrée après la fermeture des portes.',
    ],
  },
  {
    icon: 'shirt',
    title: 'Tenue',
    rules: [
      'Short / bermuda : interdit.',
      'Chaussures fermées : obligatoire.',
      'Les filles sont autorisées avec les sacs à main.',
    ],
  },
  {
    icon: 'close',
    title: 'Interdits',
    rules: [
      'Alcool, tabac, vape et drogues.',
      'Armes, objets dangereux et bouteilles en verre.',
    ],
  },
  {
    icon: 'sparkles',
    title: 'Respect',
    rules: [
      'Respecte les autres et l’équipe. Toute violence ou tout harcèlement entraîne une exclusion.',
      'Suis les consignes de l’équipe.',
    ],
  },
  {
    icon: 'ticket',
    title: 'Refus d’accès',
    rules: [
      'L’organisation se réserve le droit de refuser l’accès à toute personne ne respectant pas le présent règlement, sans remboursement.',
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
          lead="Quelques règles simples pour que la soirée soit top pour tout le monde."
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
