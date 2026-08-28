'use client';

import { useState } from 'react';
import Lightbox, { type LightboxImage } from './Lightbox';

// Grille de vignettes cliquables -> ouvre la <Lightbox> sur l'image choisie,
// avec navigation gauche/droite entre toutes les photos.
//
// Prêt pour la section GALERIE de /editions/[slug] dès qu'il y aura de vraies
// photos : `<GalleryLightbox images={photos} title={edition.name} />`
// où `photos` = [{ src:'/images/editions/<slug>/photos/1.jpg',
//                  downloadName:'la-sunshines-<slug>-01.jpg', alt:'…' }, …]
export default function GalleryLightbox({
  images,
  title,
}: {
  images: LightboxImage[];
  title?: string;
}) {
  const [openAt, setOpenAt] = useState<number | null>(null);

  return (
    <>
      <ul className="gallery-grid">
        {images.map((img, idx) => (
          <li key={img.src}>
            <button
              type="button"
              className="gallery-grid__thumb"
              onClick={() => setOpenAt(idx)}
              aria-label={`Agrandir la photo ${idx + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.src} alt={img.alt ?? ''} loading="lazy" />
            </button>
          </li>
        ))}
      </ul>

      <Lightbox
        images={images}
        startIndex={openAt ?? 0}
        open={openAt !== null}
        onClose={() => setOpenAt(null)}
        title={title}
      />
    </>
  );
}
