import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import Icon, { type IconName } from '@/components/Icon';
import { RULES } from '@/lib/rulesText';

export const metadata: Metadata = {
  title: 'Règlement · LA SUNSHINES',
  description:
    'Règlement LA SUNSHINES : à l’entrée, tenue, interdits, respect et refus d’accès pour les soirées 12–17 ans.',
};

type Section = { icon: IconName; title: string; rules: ReactNode[] };

const ICONS: Record<string, IconName> = { 'À l’entrée': 'shield', Tenue: 'shirt', Interdits: 'close', Respect: 'sparkles', 'Refus d’accès': 'ticket' };
const SECTIONS: Section[] = RULES.map((r) => ({ icon: ICONS[r.title] ?? 'shield', title: r.title, rules: r.rules }));

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
