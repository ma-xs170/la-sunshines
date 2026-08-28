// Phase 6 — vue « contenu public » : éditions statiques (lib/editions.ts)
// + événements ajoutés depuis /admin (data/content.json), fusionnés.
//
// SERVEUR UNIQUEMENT (lit le FS via lib/store). Importé par app/page.tsx et
// app/editions/[slug]/page.tsx, jamais par un composant client.

import {
  editions as staticEditions,
  isEditionUpcoming,
  type Edition,
} from './editions';
import {
  readStoreSync,
  type StoredArtist,
  type StoredEvent,
  type StoredAnnouncement,
} from './store';
import { heroGradient } from './gradient';
import { resolveEmoji } from './editionEmoji';
import { bizoukUrlFromEmbed } from './slug';
import { stripOrgNames, cleanHeadliner } from './artists';
import { formatEditionDate } from './format';

function storedEventToEdition(ev: StoredEvent): Edition {
  const parsedDate = Date.parse(ev.date);
  const hasDate = Number.isFinite(parsedDate);
  const isFuture = hasDate && parsedDate > Date.now();
  const dateISO = hasDate
    ? new Date(parsedDate).toISOString().slice(0, 10)
    : undefined;

  const dominantColor = ev.dominantColor ?? null;
  const palette = ev.palette ?? [];

  const timeLabel = ev.time?.trim() || undefined;
  const dateFull = dateISO
    ? formatEditionDate(dateISO)
    : ev.date.trim() || 'Date à venir';

  return {
    slug: ev.slug,
    name: ev.name,
    status: isFuture ? 'next' : 'past',
    kicker: isFuture ? 'Prochaine édition' : 'Édition passée',
    venue: ev.venue.trim() ? ev.venue.trim() : null,
    headliner: cleanHeadliner(ev.headliner.trim() || undefined),
    lineup: stripOrgNames(ev.lineup ?? []),
    dateLabel: `${dateFull}${timeLabel ? ` · ${timeLabel}` : ''}`,
    dateISO,
    dateFull,
    timeLabel,
    dresscode: ev.dresscode.trim() || 'Dresscode libre',
    flyer: ev.flyer || null,
    flyerSize:
      ev.flyerW > 0 && ev.flyerH > 0 ? { w: ev.flyerW, h: ev.flyerH } : undefined,
    flyerAlt: `Affiche officielle — ${ev.name}`,
    bizoukUrl: bizoukUrlFromEmbed(ev.bizoukEmbed),
    bizoukEmbed: ev.bizoukEmbed?.trim() || null,
    dominantColor,
    palette,
    gradient: ev.gradient || heroGradient(palette, dominantColor),
    emoji: ev.emoji || resolveEmoji({ name: ev.name, dominantColor }),
  };
}

/**
 * Fusionne une surcharge admin (`ovr`) par-dessus une édition statique (`base`).
 * Les champs propres au statique (tagline, ageLabel, countdownISO, flyerSize…)
 * survivent ; ceux gérés dans /admin sont remplacés. Si le flyer n'a pas changé,
 * on garde le thème couleur / la taille / l'alt d'origine.
 */
function mergeOverride(base: Edition, se: StoredEvent, ovr: Edition): Edition {
  const flyerChanged = Boolean(se.flyer) && se.flyer !== base.flyer;
  return {
    ...base,
    name: ovr.name,
    status: ovr.status,
    kicker: ovr.kicker,
    venue: ovr.venue,
    headliner: ovr.headliner,
    lineup: ovr.lineup,
    dresscode: ovr.dresscode,
    dateISO: ovr.dateISO ?? base.dateISO,
    dateFull: ovr.dateISO ? ovr.dateFull : base.dateFull,
    dateLabel: ovr.dateISO ? ovr.dateLabel : base.dateLabel,
    timeLabel: se.time?.trim() ? ovr.timeLabel : base.timeLabel,
    flyer: se.flyer || base.flyer,
    flyerSize: flyerChanged ? ovr.flyerSize : base.flyerSize,
    flyerAlt: flyerChanged ? ovr.flyerAlt : base.flyerAlt,
    bizoukEmbed: se.bizoukEmbed?.trim() || base.bizoukEmbed,
    bizoukUrl: se.bizoukEmbed?.trim() ? ovr.bizoukUrl : base.bizoukUrl,
    dominantColor: flyerChanged ? ovr.dominantColor : base.dominantColor,
    palette: flyerChanged ? ovr.palette : base.palette,
    gradient: flyerChanged ? ovr.gradient : base.gradient,
    emoji: flyerChanged ? ovr.emoji : base.emoji,
  };
}

/** Toutes les éditions visibles publiquement : statiques + surcharges/ajouts admin. */
export function getAllEditions(): Edition[] {
  const store = readStoreSync();
  const eventBySlug = new Map(store.events.map((e) => [e.slug, e]));
  const staticSlugs = new Set(staticEditions.map((e) => e.slug));

  // 1) éditions du site, avec surcharge admin éventuelle (même slug)
  const merged = staticEditions.map((base) => {
    const se = eventBySlug.get(base.slug);
    return se ? mergeOverride(base, se, storedEventToEdition(se)) : base;
  });
  // 2) événements admin purs (slug inconnu côté statique)
  const extra = store.events
    .filter((e) => !staticSlugs.has(e.slug))
    .map(storedEventToEdition);

  // galerie admin (par slug) rattachée à chaque édition ; tri chrono décroissant
  return [...merged, ...extra]
    .map((e) => ({ ...e, gallery: store.galleries[e.slug] ?? e.gallery ?? [] }))
    .sort((a, b) => (b.dateISO ?? '').localeCompare(a.dateISO ?? ''));
}

/** Photos de la galerie d'une édition (par slug). */
export function getGallery(slug: string): string[] {
  return readStoreSync().galleries[slug] ?? [];
}

export function getEditionBySlug(slug: string): Edition | undefined {
  return getAllEditions().find((e) => e.slug === slug);
}

/** La prochaine soirée à venir = la plus PROCHE dans le temps (pas juste
 *  `status === 'next'`), ou `undefined` si plus rien à venir. */
export function getNextEdition(): Edition | undefined {
  return getAllEditions()
    .filter(isEditionUpcoming)
    .sort((a, b) => (a.dateISO ?? '').localeCompare(b.dateISO ?? ''))[0];
}

/** Édition mise en avant dans le bandeau CTA de la homepage :
 *  la prochaine à venir, sinon la plus récente passée (bandeau « Merci »). */
export function getFeaturedEdition(): Edition | undefined {
  return getNextEdition() ?? getAllEditions()[0]; // getAllEditions trié par date décroissante
}

export function getArtists(): StoredArtist[] {
  return readStoreSync().artists;
}

/** Annonce active affichée dans le bandeau du site (la plus récente active). */
export function getActiveAnnouncement(): StoredAnnouncement | null {
  const list = readStoreSync().announcements.filter((a) => a.active && a.text.trim());
  if (list.length === 0) return null;
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}
