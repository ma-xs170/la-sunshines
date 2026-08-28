'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Effets globaux (montés UNE fois dans le layout).
 *
 * ─── Bug historique « le contenu disparaît après plusieurs navigations » ───
 * L'App Router ne recrée pas le DOM : les pages rendues par un composant client
 * (ex. /editions → EditionsFilterable) montent leurs éléments `[data-reveal]`
 * APRÈS le changement de `pathname`, et l'IntersectionObserver ne délivre pas
 * toujours son callback initial après une navigation SPA → des blocs restaient
 * bloqués à `opacity:0`.
 *
 * Stratégie (rigueur imposée + renforcée) :
 *  1. UN seul IntersectionObserver persistant + UN MutationObserver persistant
 *     (créés dans l'effet `[]`). Tout `[data-reveal]` ajouté au DOM est pris en
 *     charge, quel que soit le moment où il apparaît → immunisé contre les races.
 *  2. **Premier chargement** d'une page : vraie révélation au scroll (esthétique).
 *  3. **Navigation SPA** (changement de `pathname`) : on révèle TOUT le contenu
 *     présent immédiatement (après paint), sans ré-animer, sans fenêtre d'attente
 *     — et le MutationObserver passe en mode « révèle tout de suite » pour les
 *     éléments montés juste après. Aucun élément ne peut rester à `opacity:0`.
 *  4. `ScrollTrigger.refresh()` après chaque route si le plugin est chargé
 *     (pages événement). Les ScrollTrigger eux-mêmes sont créés/nettoyés dans
 *     `EventEmojiField` via `gsap.context()` + `revert()` + `kill()` défensif.
 *  5. Intro GSAP du hero scopée via `gsap.context()` et `revert()`ée par route.
 */
export default function SiteEffects() {
  const pathname = usePathname();
  const rescanRef = useRef<(() => void) | null>(null);
  // 'scroll' = révélation progressive au scroll ; 'now' = tout de suite
  const modeRef = useRef<'scroll' | 'now'>('scroll');
  const firstRouteRef = useRef(true);

  /* -------- une seule fois : reveal (IO + MO) + Lenis + parallax -------- */
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasIO = 'IntersectionObserver' in window;

    const show = (el: Element) => el.classList.add('is-in');
    const hidden = () =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-in)'));

    let io: IntersectionObserver | null = null;

    if (!reduce && hasIO) {
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              show(e.target);
              io!.unobserve(e.target);
            }
          }
        },
        { rootMargin: '0px 0px -6% 0px', threshold: 0.05 },
      );
    }

    const track = (el: HTMLElement) => {
      if (el.classList.contains('is-in')) return;
      if (!io) {
        show(el);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 1.05 && r.bottom > -80) show(el);
      else io.observe(el);
    };

    const rescan = () => {
      const els = hidden();
      if (reduce || modeRef.current === 'now') els.forEach(show);
      else els.forEach(track);
    };
    rescanRef.current = rescan;
    rescan(); // premier passage (chargement initial)

    // filet de sécurité (chargement initial) : au bout de ~1,8 s tout ce qui
    // reste caché est révélé (sans animation) — comme l'ancien correctif. Aucun
    // élément ne peut rester bloqué à opacity:0, même si l'IO ne se déclenche pas.
    const bootSafety = window.setTimeout(() => {
      hidden().forEach(show);
    }, 1800);

    // tout [data-reveal] ajouté ensuite (nouvelle page, filtres…) est pris en charge
    let moRaf = 0;
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          const el = n as HTMLElement;
          if (
            el.matches?.('[data-reveal]:not(.is-in)') ||
            el.querySelector?.('[data-reveal]:not(.is-in)')
          ) {
            cancelAnimationFrame(moRaf);
            moRaf = requestAnimationFrame(rescan);
            return;
          }
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // ---- Lenis + parallax des halos (une seule fois) ----
    let cancelled = false;
    const cleanups: Array<() => void> = [];
    if (!reduce) {
      import('lenis').then(({ default: Lenis }) => {
        if (cancelled) return;
        const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
        let raf = requestAnimationFrame(function loop(t: number) {
          lenis.raf(t);
          raf = requestAnimationFrame(loop);
        });
        cleanups.push(() => {
          cancelAnimationFrame(raf);
          lenis.destroy();
        });
      });

      if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        import('gsap').then(({ default: gsap }) => {
          if (cancelled) return;
          const onMove = (ev: MouseEvent) => {
            const x = (ev.clientX / window.innerWidth - 0.5) * 26;
            const y = (ev.clientY / window.innerHeight - 0.5) * 26;
            gsap.to('.glow .g1', { x: x * 0.6, y: y * 0.6, duration: 1.2, ease: 'power2.out' });
            gsap.to('.glow .g2', { x: -x * 0.5, y: -y * 0.5, duration: 1.2, ease: 'power2.out' });
          };
          document.addEventListener('mousemove', onMove);
          cleanups.push(() => document.removeEventListener('mousemove', onMove));
        });
      }
    }

    return () => {
      cancelled = true;
      io?.disconnect();
      mo.disconnect();
      cancelAnimationFrame(moRaf);
      clearTimeout(bootSafety);
      rescanRef.current = null;
      cleanups.forEach((fn) => fn());
    };
  }, []);

  /* -------- à chaque route -------- */
  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;
    const timers: number[] = [];

    if (firstRouteRef.current) {
      // chargement initial : on garde la révélation au scroll (déjà lancée par
      // l'effet []). Rien de plus.
      firstRouteRef.current = false;
    } else {
      // navigation SPA : révèle tout le contenu présent, sans attendre ni ré-animer.
      modeRef.current = 'now';
      const flush = () => rescanRef.current?.();
      raf1 = requestAnimationFrame(() => {
        flush();
        raf2 = requestAnimationFrame(flush);
      });
      // filets successifs pour le contenu monté juste après le changement de route
      [50, 200, 600].forEach((ms) =>
        timers.push(window.setTimeout(flush, ms)),
      );
    }

    // Recale les ScrollTrigger si le plugin est déjà chargé (pages événement).
    // On n'importe PAS le chunk ScrollTrigger si personne ne l'a chargé.
    import('gsap')
      .then(({ default: gsap }) => {
        const core = gsap.core as unknown as {
          globals?: () => Record<string, { refresh?: () => void } | undefined>;
        };
        core.globals?.().ScrollTrigger?.refresh?.();
      })
      .catch(() => {});

    // Intro du hero (homepage) — scopée + nettoyée.
    let cancelled = false;
    let revertHero: (() => void) | undefined;
    import('gsap').then(({ default: gsap }) => {
      if (cancelled) return;
      const hero = document.querySelector('.hero');
      if (!hero) return;
      const ctx = gsap.context(() => {
        gsap.from('.hero .eyebrow, .hero .wordmark, .hero__sub, .hero .btn-row', {
          opacity: 0,
          y: 22,
          duration: 0.8,
          stagger: 0.1,
          ease: 'power3.out',
        });
      }, hero as Element);
      revertHero = () => ctx.revert();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      timers.forEach(clearTimeout);
      revertHero?.();
    };
  }, [pathname]);

  return null;
}
