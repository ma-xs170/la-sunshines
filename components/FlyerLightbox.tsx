'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import Lightbox from './Lightbox';

// Rend le flyer d'une page événement, cliquable -> ouvre la <Lightbox> (1 image).
export default function FlyerLightbox({
  src,
  width,
  height,
  alt,
  downloadName,
  title,
}: {
  src: string;
  width?: number;
  height?: number;
  alt: string;
  downloadName: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);

  // Le conteneur adopte le ratio RÉEL du flyer (carré, portrait, paysage…) →
  // aucune partie coupée. Repli 3/4 si les dimensions sont inconnues.
  const style =
    width && height
      ? ({ '--flyer-ar': `${width} / ${height}` } as CSSProperties)
      : undefined;

  return (
    <>
      <button
        type="button"
        className="event-flyer__btn"
        style={style}
        onClick={() => setOpen(true)}
        aria-label="Agrandir l’affiche"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={width} height={height} alt={alt} />
      </button>
      <Lightbox
        images={[{ src, downloadName, alt }]}
        open={open}
        onClose={() => setOpen(false)}
        title={title}
      />
    </>
  );
}
