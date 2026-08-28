'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

export interface LightboxImage {
  /** URL de l'image (fichier dans /public/images/…). */
  src: string;
  /** Nom de fichier propre pour le téléchargement (ex. la-sunshines-candy-land.jpg). */
  downloadName: string;
  alt?: string;
}

// Visionneuse plein écran réutilisable :
//  - flyer seul  -> images = [uneImage]
//  - galerie     -> images = [plusieurs] + flèches de navigation
// Le header/nav du site reste visible au-dessus (z-index < .nav-wrap).
export default function Lightbox({
  images,
  startIndex = 0,
  open,
  onClose,
  title,
}: {
  images: LightboxImage[];
  startIndex?: number;
  open: boolean;
  onClose: () => void;
  title?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [i, setI] = useState(startIndex);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  const count = images.length;
  const current = images[Math.min(Math.max(i, 0), count - 1)];

  const go = useCallback(
    (delta: number) => setI((p) => (p + delta + count) % count),
    [count],
  );

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (open) setI(startIndex);
  }, [open, startIndex]);

  // verrouille le scroll + gère le focus tant que la lightbox est ouverte
  useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      lastFocused.current?.focus?.();
    };
  }, [open]);

  // clavier : Échap ferme, flèches naviguent, Tab reste piégé dans la modale
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' && count > 1) {
        go(1);
      } else if (e.key === 'ArrowLeft' && count > 1) {
        go(-1);
      } else if (e.key === 'Tab') {
        const f = dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])',
        );
        if (!f || f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, count, go, onClose]);

  async function share() {
    const url = window.location.href;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: title ?? document.title, url });
      } catch {
        /* partage annulé par l'utilisateur */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* presse-papier indisponible */
    }
  }

  if (!open || !mounted || !current) return null;

  return createPortal(
    <div
      className="lb"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? 'Image en plein écran'}
      ref={dialogRef}
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="lb__bar">
        <span className="lb__title">
          {title}
          {count > 1 ? ` · ${i + 1}/${count}` : ''}
        </span>
        <div className="lb__actions">
          <a
            className="lb__btn"
            href={current.src}
            download={current.downloadName}
            aria-label="Télécharger l’image"
          >
            <Icon name="download" />
            <span>Télécharger</span>
          </a>
          <button
            className="lb__btn"
            type="button"
            onClick={share}
            aria-label="Partager"
          >
            <Icon name="share" />
            <span>{copied ? 'Lien copié' : 'Partager'}</span>
          </button>
          <button
            className="lb__btn lb__btn--icon"
            type="button"
            onClick={onClose}
            aria-label="Fermer"
          >
            <Icon name="close" />
          </button>
        </div>
      </div>

      <div
        className="lb__stage"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {count > 1 && (
          <button
            className="lb__nav lb__nav--prev"
            type="button"
            onClick={() => go(-1)}
            aria-label="Image précédente"
          >
            <Icon name="chevron-left" />
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="lb__img" src={current.src} alt={current.alt ?? ''} />
        {count > 1 && (
          <button
            className="lb__nav lb__nav--next"
            type="button"
            onClick={() => go(1)}
            aria-label="Image suivante"
          >
            <Icon name="chevron-right" />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
