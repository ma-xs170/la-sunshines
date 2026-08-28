import type { CSSProperties } from 'react';
import type { Edition } from '@/lib/editions';
import { vividAccent } from '@/lib/gradient';

/**
 * Ambiance colorée (blobs flous) dérivée du flyer de l'édition.
 * Remplace le glow ambiant amber/coral du site sur les pages /editions/[slug]
 * (voir `body:has(.event-atmos) .glow { display:none }` dans globals.css).
 *
 * NB : les emojis thématiques en arrière-plan sont désormais gérés par
 * `EventEmojiField` (couche séparée, répartie sur toute la hauteur de page +
 * parallax au scroll via GSAP ScrollTrigger).
 *
 * ─── D'OÙ VIENNENT LES DONNÉES (pour maintenance / futur panneau /admin) ───
 *  • Couleurs : extraites du flyer AU BUILD par `scripts/extract-flyer-colors.mjs`
 *    → `lib/flyerColors.generated.ts` (FLYER_COLORS + FLYER_PALETTES), puis
 *    injectées dans `Edition.dominantColor` / `Edition.palette` par le `.map()`
 *    de `lib/editions.ts`. Régénérer après ajout d'un flyer : `npm run colors`.
 *    (Côté /admin : `lib/clientColor.ts` fait la même extraction dans le
 *    navigateur au moment de l'upload du flyer.)
 *  • Emoji : `lib/editionEmoji.ts` → `resolveEmoji()` + la table `KEYWORD_EMOJI`
 *    (mot-clé du nom prioritaire, couleur dominante en repli).
 *  • `usablePalette()` (lib/gradient.ts) écarte les teintes quasi noires/blanches.
 *
 * ─── AJOUTER / AJUSTER UNE ÉDITION ───
 *  1. Déposer le flyer dans `public/images/editions/<slug>.<ext>`.
 *  2. `npm run colors` → la palette et l'emoji sont recalculés, le thème suit.
 *  Rien à coder ici : ce composant lit `edition.palette` / `edition.emoji`.
 */
export default function EventAtmosphere({ edition }: { edition: Edition }) {
  // Teinte d'accent VIVE dérivée du propre flyer de l'édition (générique, pas de
  // cas particulier). `vividAccent` garde la teinte du flyer mais garantit une
  // saturation/luminosité perceptibles sur le fond crème — sinon les flyers à
  // fond sombre (La Nuit, Before Christmas, Welcome…) donnaient un voile invisible.
  const p = edition.palette;
  const d = edition.dominantColor;
  const c0 = vividAccent(p, d); // teinte principale
  const c1 = vividAccent(p, d, { spread: 24, light: 0.62 }); // variante claire
  const c2 = vividAccent(p, d, { spread: -22, light: 0.48 }); // variante sombre

  return (
    <div
      className="event-atmos"
      aria-hidden="true"
      style={
        {
          '--ea-0': c0,
          '--ea-1': c1,
          '--ea-2': c2,
        } as CSSProperties
      }
    >
      <span className="event-atmos__wash" />
      <span className="event-atmos__blob event-atmos__blob--a" />
      <span className="event-atmos__blob event-atmos__blob--b" />
      <span className="event-atmos__blob event-atmos__blob--c" />
    </div>
  );
}
