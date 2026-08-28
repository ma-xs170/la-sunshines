import Image from 'next/image';
import Icon from './Icon';
import HeroVideo from './HeroVideo';

export default function Hero() {
  return (
    <section id="accueil" className="hero">
      <HeroVideo />
      <div className="hero__overlay" aria-hidden="true" />

      <div className="hero__body">
        <span className="eyebrow glass">Soirée 12–17 ans</span>
        <h1 className="wordmark">
          <Image
            className="wordmark__img"
            src="/images/logo.png"
            alt="LA SUNSHINES"
            width={848}
            height={168}
            priority
          />
        </h1>
        <p className="hero__sub">
          La soirée référence des ados en Guadeloupe. Sécurisée, encadrée, et toujours la
          meilleure ambiance.
        </p>
        <div className="btn-row">
          <a className="btn btn--amber" href="#billetterie">
            <Icon name="ticket" />
            <span>Réserver maintenant</span>
          </a>
          <a className="btn btn--outline" href="/editions">
            <span>Voir les éditions</span>
            <Icon name="arrow-right" />
          </a>
        </div>
      </div>
    </section>
  );
}
