'use client';

import { useEffect, useRef, useState } from 'react';

// Fond du hero : vidéo plein cadre.
// - prefers-reduced-motion  -> image poster seule, aucune lecture
// - sinon : DEUX <video> superposées qui se relaient en fondu enchaîné.
//   Le clip source (~7 s) commence sur une image claire et finit sur une image
//   sombre : une boucle brute « saute » visiblement. Le crossfade masque la
//   couture — quand A approche de la fin, B redémarre à 0 et on fait un fondu.
//
// La vidéo réelle est dans public/videos/hero.mp4.

const POSTER = '/images/hero-nuit-des-ombres.jpg';
const VIDEO = '/videos/hero.mp4';
const FADE = 0.9; // secondes de recouvrement entre les deux pistes

export default function HeroVideo() {
  const [motionOK, setMotionOK] = useState(true);
  const aRef = useRef<HTMLVideoElement>(null);
  const bRef = useRef<HTMLVideoElement>(null);
  // quelle piste est visible au départ
  const [front, setFront] = useState<'a' | 'b'>('a');

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setMotionOK(!mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!motionOK) return;
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b) return;

    let current = a;
    let other = b;
    let swapping = false;

    a.play().catch(() => {});

    const onTime = () => {
      if (swapping || !current.duration) return;
      if (current.currentTime >= current.duration - FADE) {
        swapping = true;
        other.currentTime = 0;
        other.play().catch(() => {});
        setFront(other === a ? 'a' : 'b');
        // après le fondu, on remet l'ancienne piste au début, prête pour le tour suivant
        window.setTimeout(() => {
          current.pause();
          current.currentTime = 0;
          const tmp = current;
          current = other;
          other = tmp;
          swapping = false;
        }, FADE * 1000);
      }
    };

    a.addEventListener('timeupdate', onTime);
    b.addEventListener('timeupdate', onTime);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      b.removeEventListener('timeupdate', onTime);
    };
  }, [motionOK]);

  if (!motionOK) {
    /* eslint-disable-next-line @next/next/no-img-element */
    return <img className="hero__media" src={POSTER} alt="" aria-hidden="true" />;
  }

  const common = {
    className: 'hero__media hero__media--video',
    muted: true,
    playsInline: true,
    preload: 'metadata' as const,
    poster: POSTER,
    'aria-hidden': true,
    tabIndex: -1,
  };

  return (
    <>
      <video
        {...common}
        ref={aRef}
        data-front={front === 'a'}
        style={{ opacity: front === 'a' ? 1 : 0 }}
      >
        <source src={VIDEO} type="video/mp4" />
      </video>
      <video
        {...common}
        ref={bRef}
        data-front={front === 'b'}
        style={{ opacity: front === 'b' ? 1 : 0 }}
      >
        <source src={VIDEO} type="video/mp4" />
      </video>
    </>
  );
}
