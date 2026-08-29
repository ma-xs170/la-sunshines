// Données des éditions LA SUNSHINES.
// Source de vérité unique — la homepage (et plus tard les pages /editions/[slug])
// lisent ici. Rien n'est recalculé au render.

import { FLYER_COLORS, FLYER_PALETTES } from './flyerColors.generated';
import { resolveEmoji } from './editionEmoji';
import { heroGradient } from './gradient';
import { stripOrgNames, cleanHeadliner } from './artists';
import { formatEditionDate } from './format';

export type EditionStatus = 'next' | 'past';

export interface Edition {
  slug: string;
  name: string;
  status: EditionStatus;
  /** Petit intitulé au-dessus du titre de la carte. */
  kicker: string;
  /** Accroche (carte « à venir » uniquement pour l'instant). */
  tagline?: string;
  /**
   * Lieu. RÈGLE : on n'affiche un lieu QUE s'il est explicitement écrit sur la
   * page Bizouk de l'événement. `null` = pas de lieu communiqué.
   * Pour une édition à venir sans lieu annoncé, on utilise le placeholder
   * « SUN'LAND » (voir La Nuit Des Ombres).
   */
  venue: string | null;
  /** Tête d'affiche telle qu'affichée sur la carte. */
  headliner?: string;
  /** Line-up complet (utilisé en Phase 3, pages événement). */
  lineup: string[];
  /**
   * Libellé date + heure brut, ex. « Sam. 17 Octobre · 16h–22h ».
   * SOURCE : sert à extraire la plage horaire. L'affichage de la date passe
   * par `dateFull` (dérivé de `dateISO` via lib/format).
   */
  dateLabel: string;
  /**
   * Date réelle de l'édition au format ISO `AAAA-MM-JJ`. Sert au tri
   * chronologique, au filtre par année (/editions) et au formatage de la date
   * affichée. `undefined` = date inconnue.
   */
  dateISO?: string;
  /** Date affichée normalisée (« Sam. 17 Octobre »). Calculée depuis `dateISO`. */
  dateFull: string;
  /** Plage horaire affichée (« 16h–22h »), ou `undefined`. Extraite de `dateLabel`. */
  timeLabel?: string;
  /** Libellé dresscode affiché dans le chip. */
  dresscode: string;
  /** Chip supplémentaire (carte « à venir »). */
  ageLabel?: string;
  /** Flyer local, ou `null` si pas encore disponible. */
  flyer: string | null;
  flyerSize?: { w: number; h: number };
  flyerAlt?: string;
  /** URL réelle de la billetterie Bizouk. */
  bizoukUrl: string | null;
  /**
   * Code d'intégration Bizouk brut (iframe). `null` pour les éditions statiques ;
   * renseigné pour les événements créés depuis /admin (Phase 6).
   */
  bizoukEmbed?: string | null;
  /** Cible du compte à rebours (édition à venir). */
  countdownISO?: string;
  /**
   * Couleur dominante du flyer (#rrggbb), extraite au build par
   * `scripts/extract-flyer-colors.mjs`. `null` si pas de flyer.
   */
  dominantColor: string | null;
  /** Jusqu'à 3 teintes dominantes du flyer (Phase 3). `[]` si pas de flyer. */
  palette: string[];
  /** Dégradé CSS du hero de la page événement, dérivé de `palette` (Phase 3). */
  gradient: string;
  /**
   * Emoji de l'édition (Phase 1). Mot-clé du nom prioritaire, couleur dominante
   * du flyer en repli, ✨ sinon. Calculé une fois au chargement du module.
   */
  emoji: string;
  /**
   * Photos de galerie (data URLs), gérées depuis /admin par slug d'édition.
   * Rempli par `lib/content.ts` à la lecture ; `[]` par défaut.
   */
  gallery?: string[];
  /**
   * Événement PRIVÉ : masqué du site public (listing, page détail → 404, hero,
   * pages artistes, sitemap). Réversible depuis /admin. Les éditions statiques
   * peuvent l'être via une surcharge admin qui ne change QUE ce champ.
   * `undefined` / `false` = visible.
   */
  hidden?: boolean;
  /** Archivé côté admin — invisible publiquement, comme `hidden`. */
  archived?: boolean;
  /** Programme horaire (running order), géré depuis /admin. `[]` si vide. */
  schedule?: import('./store').ScheduleEntry[];
}

type EditionSeed = Omit<
  Edition,
  | 'dominantColor'
  | 'palette'
  | 'gradient'
  | 'emoji'
  | 'dateFull'
  | 'timeLabel'
  | 'gallery'
>;

const seeds: EditionSeed[] = [
  {
    slug: 'la-nuit-des-ombres',
    name: 'La Nuit Des Ombres',
    status: 'next',
    kicker: 'Prochaine édition',
    tagline: '« Cette fois, on t’emmène dans une nuit pas comme les autres… »',
    // Lieu pas encore communiqué sur Bizouk -> placeholder SUN'LAND
    venue: "SUN'LAND",
    lineup: [],
    dateLabel: 'Sam. 17 Octobre · 16h–22h',
    dateISO: '2026-10-17',
    dresscode: 'Dresscode Bleu ou Noir',
    ageLabel: 'Réservé aux 12–17 ans',
    flyer: '/images/editions/la-nuit-des-ombres.png',
    flyerSize: { w: 2000, h: 2000 },
    flyerAlt:
      'Affiche officielle — La Sunshines : La Nuit Des Ombres, samedi 17 octobre, 16h–22h, Guadeloupe',
    bizoukUrl: 'https://www.bizouk.com/stores/reservation/place?event=128267',
    countdownISO: '2026-10-17T20:00:00',
  },
  {
    slug: 'welcome-to-dominica',
    name: 'Welcome to Dominica',
    status: 'past',
    kicker: 'Édition passée',
    venue: 'W Club by Ciroc, Jarry — Baie-Mahault',
    headliner: 'Dreezy · DJ Syxtee',
    lineup: ['Dreezy', 'DJ Syxtee', 'Doms', 'Wiixx', 'Buz'],
    dateLabel: '14 Août · 16h–22h',
    dateISO: '2026-08-14',
    dresscode: 'Dresscode Vert ou Rouge',
    flyer: '/images/editions/welcome-to-dominica.jpg',
    flyerSize: { w: 800, h: 1067 },
    flyerAlt: 'Affiche officielle — La Sunshines : Welcome to Dominica, 14 août',
    bizoukUrl:
      'https://www.bizouk.com/events/details/la-sunshines-welcome-to-dominica-dreezy/127255',
  },
  {
    slug: 'candy-land',
    name: 'Candy Land',
    status: 'past',
    kicker: 'Édition passée',
    venue: 'W Club by Ciroc, Jarry — Baie-Mahault',
    headliner: 'Timalash · Lil Scott',
    lineup: ['Timalash', 'Lil Scott', 'Yoyo', 'KLM', 'Syxtee', 'Dreezy', 'Buz'],
    dateLabel: '31 Juillet · 16h–22h',
    dateISO: '2026-07-31',
    dresscode: 'Dresscode Rose & Blanc',
    flyer: '/images/editions/candy-land.jpg',
    flyerSize: { w: 800, h: 1067 },
    flyerAlt: 'Affiche officielle — La Sunshines : Candy Land, 31 juillet',
    bizoukUrl:
      'https://www.bizouk.com/events/details/la-sunshines-edition-candy-land-timalash/125726',
  },
  {
    slug: 'edition-picasso',
    name: 'Édition Picasso',
    status: 'past',
    kicker: 'Édition passée',
    venue: 'W Club by Ciroc, Jarry — Baie-Mahault',
    headliner: 'Jeune Aber · Dega Youth · Lulux',
    lineup: ['Jeune Aber', 'Dega Youth', 'Lulux', "Styll'One", 'Buzz', 'Wiixx', 'Syxtee', 'Dreezy'],
    dateLabel: '10 Juillet · 16h–22h',
    dateISO: '2026-07-10',
    dresscode: 'Dresscode libre',
    flyer: '/images/editions/edition-picasso.jpg',
    flyerSize: { w: 800, h: 1067 },
    flyerAlt: 'Affiche officielle — La Sunshines : Édition Picasso, 10 juillet',
    bizoukUrl:
      'https://www.bizouk.com/events/details/la-sunshines-edition-picasso-jeune-aber/121434',
  },
  {
    slug: 'la-xploz-tropical-island',
    name: 'La Xploz · Tropical Island',
    status: 'past',
    kicker: 'Édition passée',
    venue: "L'Infini Night Club, Gosier",
    headliner: 'LATOP · LMS',
    lineup: ['DJ Tomtom', 'DJ Mano', 'DJ Doms'],
    dateLabel: '08 Avril · 16h–22h',
    dateISO: '2026-04-08',
    dresscode: 'Dresscode White & Pink',
    flyer: '/images/editions/la-xploz-tropical-island.jpg',
    flyerSize: { w: 1067, h: 1067 },
    flyerAlt: 'Affiche officielle — La Sunshines x La Xploz : Tropical Island, 8 avril',
    bizoukUrl:
      'https://www.bizouk.com/events/details/la-sunshines-la-xploz-tropical-island/116817',
  },
  {
    slug: 'before-christmas',
    name: 'Before Christmas (2025)',
    status: 'past',
    kicker: 'Édition passée',
    venue: 'Le PURE, Baie-Mahault',
    headliner: 'Lms · Laydow · Dega Youth · Ti Manix',
    lineup: [
      'Lms',
      'Laydow',
      'Dega Youth',
      'Ti Manix',
      'Cloclo',
      'Tipitoff',
      'KLM',
      'Dyxonn',
      'Weswes',
    ],
    dateLabel: '23 Décembre · 15h–23h',
    dateISO: '2025-12-23',
    dresscode: 'Dresscode Rouge & Blanc',
    flyer: '/images/editions/before-christmas.jpg',
    flyerSize: { w: 1067, h: 1067 },
    flyerAlt: 'Affiche officielle — La Sunshines : Before Christmas, 23 décembre',
    bizoukUrl:
      'https://www.bizouk.com/events/details/la-sunshines-before-christmas-2025/111794',
  },
];

/** « Sam. 17 Octobre · 16h–22h » -> « 16h–22h » (partie après le · , sinon vide). */
function timeFromLabel(dateLabel: string): string | undefined {
  const after = dateLabel.split(/\s*·\s*/).slice(1).join(' · ').trim();
  return after || undefined;
}

export const editions: Edition[] = seeds.map((seed) => {
  const dominantColor = FLYER_COLORS[seed.slug] ?? null;
  const palette = FLYER_PALETTES[seed.slug] ?? [];
  return {
    ...seed,
    // garde-fou : jamais de « DJ La Sunshines / DJ La Xploz » dans le line-up
    headliner: cleanHeadliner(seed.headliner),
    lineup: stripOrgNames(seed.lineup),
    dateFull:
      formatEditionDate(seed.dateISO) ||
      seed.dateLabel.split(/\s*·\s*/)[0].trim(),
    timeLabel: timeFromLabel(seed.dateLabel),
    dominantColor,
    palette,
    gradient: heroGradient(palette, dominantColor),
    emoji: resolveEmoji({ name: seed.name, dominantColor }),
  };
});

export const nextEdition = editions.find((e) => e.status === 'next');
export const pastEditions = editions.filter((e) => e.status === 'past');

export function getEdition(slug: string): Edition | undefined {
  return editions.find((e) => e.slug === slug);
}

/** Année d'une édition, dérivée de `dateISO`. `null` si date inconnue. */
export function editionYear(ed: Edition): number | null {
  if (!ed.dateISO) return null;
  const y = Number(ed.dateISO.slice(0, 4));
  return Number.isInteger(y) ? y : null;
}

/**
 * Édition « à venir » ? Même logique que les badges À venir / Passée
 * (`status`), affinée par la date réelle quand elle est connue de façon fiable
 * (`countdownISO`, ISO daté). Passé cette date, l'édition redevient « passée »
 * automatiquement même si `status` n'a pas été mis à jour.
 */
export function isEditionUpcoming(ed: Edition): boolean {
  if (ed.countdownISO) {
    const t = Date.parse(ed.countdownISO);
    if (Number.isFinite(t)) return t > Date.now();
  }
  return ed.status === 'next';
}
