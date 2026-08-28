import Link from 'next/link';
import Icon, { type IconName } from './Icon';

// Placeholder quand la prochaine édition n'a pas encore de lieu communiqué
// (même règle que lib/editions.ts / le bandeau CTA).
const VENUE_PLACEHOLDER = "SUN'LAND, Guadeloupe";

type InfoCard = { icon: IconName; title: string; text: string };

function buildCards(lieu: string): InfoCard[] {
  return [
    { icon: 'map-pin', title: 'Lieu', text: lieu },
    { icon: 'cake', title: 'Âge', text: "12 à 17 ans, contrôle à l'entrée" },
    {
      icon: 'ticket',
      title: 'Billetterie',
      text: 'Préventes Bizouk & Kiwol, 100 % sécurisées',
    },
    {
      icon: 'shield',
      title: 'Encadrement',
      text: 'Sécurité & staff dédiés toute la soirée',
    },
    { icon: 'shirt', title: 'Tenue', text: "Dresscode selon l'édition" },
    { icon: 'car', title: 'Accès', text: 'Dépose & récupération encadrées' },
  ];
}

// `preview` (homepage) : 3 cartes + lien « Voir plus » vers /infos.
// mode complet (page /infos) : les 6 cartes, titre en <h1>, pas de lien.
export default function Infos({
  nextVenue,
  preview = false,
}: {
  nextVenue?: string | null;
  preview?: boolean;
}) {
  const lieu = nextVenue && nextVenue.trim() ? nextVenue.trim() : VENUE_PLACEHOLDER;
  const cards = buildCards(lieu);
  const shown = preview ? cards.slice(0, 3) : cards;

  return (
    <section id="infos" className="infos">
      <header className="section-head">
        <span className="script">Infos</span>
        {preview ? <h2>Avant de venir.</h2> : <h1>Avant de venir.</h1>}
        <p className="infos__lead">
          On garde l&apos;expérience simple : accès encadré, une soirée claire, et tout ce
          qu&apos;il faut pour que les ados profitent en toute sécurité.
        </p>
      </header>

      <div className="infos-grid">
        {shown.map((c) => (
          <div className="info-card glass" data-reveal key={c.title}>
            <span className="info-card__icon">
              <Icon name={c.icon} />
            </span>
            <h4>{c.title}</h4>
            <p>{c.text}</p>
          </div>
        ))}
      </div>

      {preview && (
        <div className="infos__more">
          <Link className="btn btn--outline btn--lg" href="/infos">
            <span>Voir&nbsp;plus</span>
            <Icon name="arrow-right" />
          </Link>
        </div>
      )}
    </section>
  );
}
