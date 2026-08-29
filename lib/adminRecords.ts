// Phase 6 — construction / mise à jour des enregistrements admin (serveur).

import {
  type Store,
  type StoredArtist,
  type StoredEvent,
  type StoredAnnouncement,
  type ScheduleEntry,
  newId,
} from './store';
import { slugify, uniqueSlug } from './slug';
import { editions as staticEditions } from './editions';
import { heroGradient } from './gradient';
import { resolveEmoji } from './editionEmoji';

export type ArtistInput = {
  name?: unknown;
  role?: unknown;
  bio?: unknown;
  image?: unknown;
  instagram?: unknown;
  tiktok?: unknown;
  soundcloud?: unknown;
  email?: unknown;
};

export type EventInput = {
  name?: unknown;
  /** slug imposé (édition du site « matérialisée » en surcharge) ; sinon auto. */
  slug?: unknown;
  date?: unknown;
  time?: unknown;
  description?: unknown;
  venue?: unknown;
  dresscode?: unknown;
  headliner?: unknown;
  lineup?: unknown; // string[] ou texte multi-lignes / séparé par virgules
  bizoukEmbed?: unknown;
  flyer?: unknown; // data URL
  flyerW?: unknown; // dimensions naturelles du flyer
  flyerH?: unknown;
  dominant?: unknown; // #rrggbb calculé côté client
  palette?: unknown; // string[]
  hidden?: unknown; // booléen — événement privé (masqué du site)
  archived?: unknown; // booléen — rangé dans les archives admin
  schedule?: unknown; // ScheduleEntry[] — programme horaire
};

const str = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v.trim() : fallback;

const posInt = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

function toLineup(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === 'string') {
    return v
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function toSchedule(v: unknown): ScheduleEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
    .map((s) => ({
      id: typeof s.id === 'string' && s.id ? s.id : newId(),
      time: typeof s.time === 'string' ? s.time.trim() : '',
      artistName: typeof s.artistName === 'string' ? s.artistName.trim() : '',
      label: typeof s.label === 'string' ? s.label.trim() : '',
    }))
    .filter((s) => s.time || s.artistName || s.label);
}

function toPalette(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => String(x).trim())
    .filter((x) => /^#[0-9a-f]{6}$/i.test(x))
    .slice(0, 3);
}

function toHex(v: unknown): string | null {
  const s = str(v);
  return /^#[0-9a-f]{6}$/i.test(s) ? s : null;
}

// ---------- Artistes ----------

export function buildArtist(
  input: ArtistInput,
  store: Store,
): StoredArtist | { error: string } {
  const name = str(input.name);
  if (!name) return { error: 'Le nom de l’artiste est obligatoire.' };
  return {
    id: newId(),
    slug: uniqueSlug(
      slugify(name),
      store.artists.map((a) => a.slug),
    ),
    name,
    role: str(input.role),
    bio: str(input.bio),
    image: str(input.image),
    instagram: str(input.instagram),
    tiktok: str(input.tiktok),
    soundcloud: str(input.soundcloud),
    email: str(input.email),
    verified: false,
    createdAt: new Date().toISOString(),
  };
}

export function applyArtistPatch(
  current: StoredArtist,
  input: ArtistInput,
): StoredArtist {
  const pick = (k: keyof ArtistInput, fallback: string) =>
    input[k] !== undefined ? str(input[k]) : fallback;
  return {
    ...current,
    // le slug reste stable une fois créé (les URLs de profil ne cassent pas)
    slug: current.slug || slugify(str(input.name, current.name)),
    name: input.name !== undefined ? str(input.name, current.name) : current.name,
    role: pick('role', current.role),
    bio: pick('bio', current.bio),
    image: pick('image', current.image),
    instagram: pick('instagram', current.instagram),
    tiktok: pick('tiktok', current.tiktok),
    soundcloud: pick('soundcloud', current.soundcloud),
    email: pick('email', current.email),
  };
}

// ---------- Événements ----------

export function buildEvent(
  input: EventInput,
  store: Store,
): StoredEvent | { error: string } {
  const name = str(input.name);
  if (!name) return { error: 'Le nom de l’événement est obligatoire.' };

  const dominantColor = toHex(input.dominant);
  const palette = toPalette(input.palette);

  // slug imposé (surcharge d'une édition du site) : on le garde tel quel ;
  // sinon slug auto unique — en évitant AUSSI les slugs des éditions du site,
  // sinon un nouvel événement homonyme deviendrait une surcharge silencieuse
  // (pas de nouvelle carte sur /editions).
  const forcedSlug = str(input.slug);
  const slug = forcedSlug
    ? forcedSlug
    : uniqueSlug(slugify(name), [
        ...store.events.map((e) => e.slug),
        ...staticEditions.map((e) => e.slug),
      ]);

  return {
    id: newId(),
    slug,
    name,
    date: str(input.date),
    time: str(input.time),
    description: str(input.description),
    venue: str(input.venue), // VIDE par défaut — on n'invente pas de lieu
    dresscode: str(input.dresscode),
    headliner: str(input.headliner),
    lineup: toLineup(input.lineup),
    bizoukEmbed: str(input.bizoukEmbed),
    flyer: str(input.flyer),
    flyerW: posInt(input.flyerW),
    flyerH: posInt(input.flyerH),
    dominantColor,
    palette,
    gradient: heroGradient(palette, dominantColor),
    emoji: resolveEmoji({ name, dominantColor }),
    hidden: input.hidden === true,
    archived: input.archived === true,
    schedule: toSchedule(input.schedule),
    createdAt: new Date().toISOString(),
  };
}

export function applyEventPatch(current: StoredEvent, input: EventInput): StoredEvent {
  const next: StoredEvent = {
    ...current,
    name: input.name !== undefined ? str(input.name, current.name) : current.name,
    date: input.date !== undefined ? str(input.date) : current.date,
    time: input.time !== undefined ? str(input.time) : current.time,
    description:
      input.description !== undefined ? str(input.description) : current.description,
    venue: input.venue !== undefined ? str(input.venue) : current.venue,
    dresscode: input.dresscode !== undefined ? str(input.dresscode) : current.dresscode,
    headliner: input.headliner !== undefined ? str(input.headliner) : current.headliner,
    lineup: input.lineup !== undefined ? toLineup(input.lineup) : current.lineup,
    bizoukEmbed:
      input.bizoukEmbed !== undefined ? str(input.bizoukEmbed) : current.bizoukEmbed,
    flyer: input.flyer !== undefined ? str(input.flyer) : current.flyer,
    flyerW: input.flyerW !== undefined ? posInt(input.flyerW) : current.flyerW,
    flyerH: input.flyerH !== undefined ? posInt(input.flyerH) : current.flyerH,
    dominantColor:
      input.dominant !== undefined ? toHex(input.dominant) : current.dominantColor,
    palette: input.palette !== undefined ? toPalette(input.palette) : current.palette,
    hidden:
      input.hidden !== undefined ? input.hidden === true : current.hidden === true,
    archived:
      input.archived !== undefined
        ? input.archived === true
        : current.archived === true,
    schedule:
      input.schedule !== undefined
        ? toSchedule(input.schedule)
        : (current.schedule ?? []),
  };
  // recalculs automatiques
  next.gradient = heroGradient(next.palette, next.dominantColor);
  next.emoji = resolveEmoji({ name: next.name, dominantColor: next.dominantColor });
  return next;
}

// ---------- Annonces (bandeau site) ----------

export type AnnouncementInput = {
  text?: unknown;
  href?: unknown;
  active?: unknown;
};

export function buildAnnouncement(
  input: AnnouncementInput,
): StoredAnnouncement | { error: string } {
  const text = str(input.text);
  if (!text) return { error: 'Le texte de l’annonce est obligatoire.' };
  return {
    id: newId(),
    text,
    href: str(input.href),
    active: input.active === undefined ? true : Boolean(input.active),
    createdAt: new Date().toISOString(),
  };
}

export function applyAnnouncementPatch(
  current: StoredAnnouncement,
  input: AnnouncementInput,
): StoredAnnouncement {
  return {
    ...current,
    text: input.text !== undefined ? str(input.text, current.text) : current.text,
    href: input.href !== undefined ? str(input.href) : current.href,
    active: input.active !== undefined ? Boolean(input.active) : current.active,
  };
}
