'use client';

import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import Icon from './Icon';

const LINKS = [
  { href: '/#accueil', label: 'Accueil' },
  { href: '/editions', label: 'Éditions' },
  { href: '/infos', label: 'Infos' },
  { href: '/interdits', label: 'Règlement' },
  { href: '/contact', label: 'Contact' },
];

/** Lien de nav correspondant au chemin courant (ou '' si aucun). */
function activeHrefFor(pathname: string): string {
  if (pathname === '/') return '/#accueil';
  if (pathname.startsWith('/editions') || pathname.startsWith('/artistes'))
    return '/editions';
  if (pathname.startsWith('/infos')) return '/infos';
  if (pathname.startsWith('/interdits')) return '/interdits';
  if (pathname.startsWith('/contact')) return '/contact';
  return '';
}

export default function Nav() {
  const pathname = usePathname();
  const activeHref = activeHrefFor(pathname);

  const [open, setOpen] = useState(false);

  // Le bouton « Réserver » suit la couleur dynamique de la page (--ev-fab posé
  // sur <main.event> par pageTheme()) ; texte clair/foncé selon isDarkTheme
  // (classe .event--themed). Hors page à thème → amber par défaut.
  const [cta, setCta] = useState<{ tint: string; dark: boolean }>({
    tint: '',
    dark: false,
  });
  useEffect(() => {
    const el = document.querySelector('.event');
    setCta({
      tint: el ? getComputedStyle(el).getPropertyValue('--ev-fab').trim() : '',
      dark: el?.classList.contains('event--themed') ?? false,
    });
  }, [pathname]);

  const navRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const linksRef = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ x: number; w: number; show: boolean }>({
    x: 0,
    w: 0,
    show: false,
  });

  // Position + largeur du pill actif, mesurées sur le DOM (transition CSS = glissement).
  useEffect(() => {
    const wrap = linksRef.current;
    if (!wrap) return;
    const measure = () => {
      const el = activeHref
        ? wrap.querySelector<HTMLElement>(`a.link[data-href="${activeHref}"]`)
        : null;
      if (!el) {
        setInd((s) => ({ ...s, show: false }));
        return;
      }
      setInd({ x: el.offsetLeft, w: el.offsetWidth, show: true });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    window.addEventListener('resize', measure);
    // les polices peuvent changer la largeur après coup
    const t = window.setTimeout(measure, 250);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.clearTimeout(t);
    };
  }, [activeHref, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [open]);

  return (
    <div className="nav-wrap">
      <nav
        ref={navRef}
        aria-label="Navigation principale"
        className={open ? 'is-open' : undefined}
      >
        <a className="logo" href="/#accueil" aria-label="LA SUNSHINES — accueil">
          <Image
            className="logo__img"
            src="/images/logo-dark.png"
            alt="LA SUNSHINES"
            width={848}
            height={168}
            priority
          />
        </a>

        <button
          ref={toggleRef}
          className="nav-toggle"
          type="button"
          aria-expanded={open}
          aria-controls="nav-links"
          aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name="menu" className="icon icon--menu" />
          <Icon name="close" className="icon icon--close" />
        </button>

        <div className="links" id="nav-links" ref={linksRef}>
          <span
            className="link-indicator"
            aria-hidden="true"
            style={{
              transform: `translateX(${ind.x}px)`,
              width: `${ind.w}px`,
              opacity: ind.show ? 1 : 0,
            }}
          />
          {LINKS.map((l) => (
            <a
              key={l.href}
              data-href={l.href}
              className={l.href === activeHref ? 'link is-active' : 'link'}
              aria-current={l.href === activeHref ? 'page' : undefined}
              href={l.href}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </a>
          ))}
        </div>

        <a
          className={
            'cta' +
            (cta.tint ? ' cta--themed' : '') +
            (cta.tint && cta.dark ? ' cta--on-dark' : '')
          }
          href="/#billetterie"
          style={cta.tint ? ({ '--cta-tint': cta.tint } as CSSProperties) : undefined}
        >
          <Icon name="ticket" />
          <span>Réserver</span>
        </a>
      </nav>
    </div>
  );
}
