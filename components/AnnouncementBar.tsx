'use client';

import { useEffect, useState } from 'react';
import Icon from './Icon';

// Bandeau fin en haut du site (au-dessus de la nav). Fermable par le visiteur —
// la fermeture est mémorisée par id d'annonce (une nouvelle annonce réapparaît).
export default function AnnouncementBar({
  id,
  text,
  href,
}: {
  id: string;
  text: string;
  href?: string;
}) {
  const [dismissed, setDismissed] = useState(true); // masqué tant qu'on n'a pas lu localStorage

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(`sun_ann_dismissed`) === id);
    } catch {
      setDismissed(false);
    }
  }, [id]);

  if (dismissed) return null;

  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem('sun_ann_dismissed', id);
    } catch {
      /* stockage indisponible */
    }
  };

  const isExternal = /^https?:\/\//i.test(href ?? '');

  return (
    <div className="ann-bar" role="region" aria-label="Annonce">
      <p className="ann-bar__text">
        {text}
        {href && (
          <a
            className="ann-bar__link"
            href={href}
            {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            En savoir plus
            <Icon name="arrow-right" className="icon" />
          </a>
        )}
      </p>
      <button
        className="ann-bar__close"
        type="button"
        onClick={close}
        aria-label="Fermer l’annonce"
      >
        <Icon name="close" />
      </button>
    </div>
  );
}
