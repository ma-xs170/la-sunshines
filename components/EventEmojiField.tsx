'use client';

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';

/**
 * Champ d'emojis thématiques en parallax sur les pages /editions/[slug].
 *
 * Complète `EventAtmosphere` (blobs de couleur + fond statique) : ici les emojis
 * sont répartis sur TOUTE la hauteur de la page et leur position Y est liée au
 * scroll via GSAP ScrollTrigger (`scrub: true`) — mouvement continu, pas une
 * apparition one-shot. Chaque item a une `speed` différente => effet de
 * profondeur (les petits / flous / transparents bougent moins).
 *
 * ─── ANTI-RÉGRESSION (bug « contenu qui disparaît après plusieurs navigations ») ───
 *  • Tout est créé dans un `gsap.context(fn, scopeRef)` scopé à ce composant.
 *  • Le cleanup fait `ctx.revert()` => tweens ET ScrollTriggers de ce contexte
 *    sont détruits au démontage. Aucun ScrollTrigger orphelin entre les pages.
 *  • Le parent monte ce composant avec `key={slug}` => remontage franc par édition.
 *  • `prefers-reduced-motion` => on ne touche à rien : les emojis restent
 *    visibles mais figés à leur position CSS (aucune suppression).
 */

type Item = {
  /** position verticale de base, en % de la hauteur de page */
  top: number;
  /** ancrage horizontal */
  side: 'left' | 'right';
  offset: number; // % depuis le bord `side`
  size: number; // px (avant clamp responsive en CSS)
  opacity: number;
  rotate: number; // deg
  /** amplitude du parallax : 0 = immobile, 1 = ±100% de sa hauteur */
  speed: number;
};

// 7 instances — dispersées en hauteur, tailles / opacités / profondeurs variées.
const ITEMS: Item[] = [
  { top: 10, side: 'right', offset: 2, size: 230, opacity: 0.15, rotate: -12, speed: 0.16 },
  { top: 22, side: 'left', offset: -5, size: 380, opacity: 0.12, rotate: 8, speed: 0.42 },
  { top: 36, side: 'right', offset: 8, size: 180, opacity: 0.17, rotate: 5, speed: 0.24 },
  { top: 50, side: 'left', offset: 4, size: 300, opacity: 0.11, rotate: -7, speed: 0.34 },
  { top: 64, side: 'right', offset: -8, size: 420, opacity: 0.1, rotate: 9, speed: 0.5 },
  { top: 78, side: 'left', offset: 10, size: 200, opacity: 0.15, rotate: -4, speed: 0.19 },
  { top: 91, side: 'right', offset: 16, size: 260, opacity: 0.13, rotate: 6, speed: 0.3 },
];

export default function EventEmojiField({ emoji }: { emoji: string }) {
  const scopeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!emoji) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const scope = scopeRef.current;
    if (!scope) return;

    let cancelled = false;
    let revert: (() => void) | undefined;

    Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(
      ([{ default: gsap }, { ScrollTrigger }]) => {
        if (cancelled || !scopeRef.current) return;
        gsap.registerPlugin(ScrollTrigger);

        // Ceinture + bretelles : ce composant est le SEUL à créer des
        // ScrollTrigger. On repart d'une ardoise propre à chaque montage de
        // page — même si un `revert()` précédent avait échoué, pas d'accumulation.
        ScrollTrigger.getAll().forEach((t) => t.kill());

        const ctx = gsap.context(() => {
          const items = gsap.utils.toArray<HTMLElement>('.event-emoji-field__item');
          items.forEach((el) => {
            const speed = parseFloat(el.dataset.speed || '0.25');
            gsap.fromTo(
              el,
              { yPercent: -speed * 100 },
              {
                yPercent: speed * 100,
                ease: 'none',
                force3D: true,
                scrollTrigger: {
                  trigger: scopeRef.current!,
                  start: 'top top',
                  end: 'bottom bottom',
                  scrub: true,
                },
              },
            );
          });
        }, scopeRef);

        // positions dépendantes des polices / du layout final
        ScrollTrigger.refresh();
        const onLoad = () => ScrollTrigger.refresh();
        window.addEventListener('load', onLoad);

        // diagnostic léger : nb de ScrollTriggers vivants (doit rester stable
        // d'une page édition à l'autre — pas d'accumulation = pas de fuite).
        (window as unknown as { __stLive?: number }).__stLive =
          ScrollTrigger.getAll().length;

        revert = () => {
          window.removeEventListener('load', onLoad);
          ctx.revert(); // détruit tweens + ScrollTriggers de ce contexte
          (window as unknown as { __stLive?: number }).__stLive =
            ScrollTrigger.getAll().length;
        };
      },
    );

    return () => {
      cancelled = true;
      revert?.();
    };
  }, [emoji]);

  if (!emoji) return null;

  return (
    <div className="event-emoji-field" aria-hidden="true" ref={scopeRef}>
      {ITEMS.map((it, i) => (
        <span
          key={i}
          className="event-emoji-field__item"
          data-speed={it.speed}
          style={
            {
              top: `${it.top}%`,
              [it.side]: `${it.offset}%`,
              '--efi-size': `${it.size}px`,
              '--efi-op': it.opacity,
              '--efi-rot': `${it.rotate}deg`,
            } as CSSProperties
          }
        >
          {emoji}
        </span>
      ))}
    </div>
  );
}
