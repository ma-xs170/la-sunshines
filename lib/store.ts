// Phase 6 — stockage local du contenu géré depuis /admin.
//
// Un simple fichier JSON à la racine (data/content.json). Pas de DB.
// À N'IMPORTER QUE CÔTÉ SERVEUR (route handlers, composants serveur) : ce module
// touche le système de fichiers.
//
// Les images (flyer d'événement, photo d'artiste) sont stockées en data URL
// directement dans le JSON — aucune écriture dans public/, donc portable
// (y compris hébergement à FS en lecture seule).

import { promises as fs, readFileSync } from 'fs';
import path from 'path';
import { slugify } from './slug';
import { githubStoreEnabled, commitStoreToGithub } from './githubStore';

const FILE = path.join(process.cwd(), 'data', 'content.json');

export interface StoredArtist {
  id: string;
  /** identifiant d'URL pour /artistes/[slug] — stable une fois créé. */
  slug: string;
  name: string;
  role: string;
  /** bio texte libre ; '' si non renseignée. */
  bio: string;
  /** data URL ou chemin public ; '' si aucune image. */
  image: string;
  /** réseaux — URL complète ou pseudo ; '' = non affiché sur le profil. */
  instagram: string;
  tiktok: string;
  soundcloud: string;
  email: string;
  createdAt: string;
}

/** Complète un artiste éventuellement issu d'un ancien format (champs manquants). */
export function normalizeArtist(raw: Partial<StoredArtist> & { name?: string }): StoredArtist {
  const name = typeof raw.name === 'string' ? raw.name : '';
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    slug: typeof raw.slug === 'string' && raw.slug ? raw.slug : slugify(name),
    name,
    role: typeof raw.role === 'string' ? raw.role : '',
    bio: typeof raw.bio === 'string' ? raw.bio : '',
    image: typeof raw.image === 'string' ? raw.image : '',
    instagram: typeof raw.instagram === 'string' ? raw.instagram : '',
    tiktok: typeof raw.tiktok === 'string' ? raw.tiktok : '',
    soundcloud: typeof raw.soundcloud === 'string' ? raw.soundcloud : '',
    email: typeof raw.email === 'string' ? raw.email : '',
    createdAt:
      typeof raw.createdAt === 'string' && raw.createdAt
        ? raw.createdAt
        : new Date().toISOString(),
  };
}

export interface StoredEvent {
  id: string;
  slug: string;
  name: string;
  /** Date ISO `AAAA-MM-JJ` de préférence (sinon libellé libre). Peut être vide. */
  date: string;
  /** Plage horaire affichée, ex. « 16h–22h ». Peut être vide. */
  time: string;
  /** Lieu — VIDE par défaut (règle métier : on n'invente pas de lieu). */
  venue: string;
  dresscode: string;
  headliner: string;
  lineup: string[];
  /** Code d'intégration Bizouk brut collé par l'admin. */
  bizoukEmbed: string;
  /** data URL du flyer ou '' */
  flyer: string;
  /** dimensions naturelles du flyer (0 = inconnu) — pour l'aspect-ratio d'affichage. */
  flyerW: number;
  flyerH: number;
  /** Calculés automatiquement à la création à partir du flyer + du nom. */
  dominantColor: string | null;
  palette: string[];
  gradient: string;
  emoji: string;
  /** Événement PRIVÉ : masqué de tout le site public (réversible). Défaut false.
   *  Fonctionne aussi pour une édition statique via le mécanisme d'override. */
  hidden: boolean;
  createdAt: string;
}

export interface StoredAnnouncement {
  id: string;
  /** texte court affiché dans le bandeau. */
  text: string;
  /** lien optionnel (URL absolue ou chemin interne). */
  href: string;
  /** une seule annonce active à la fois est montrée (la plus récente). */
  active: boolean;
  createdAt: string;
}

/** Demande de contact / support créée par l'assistant (chatbot). */
export interface StoredTicket {
  id: string;
  name: string;
  email: string;
  phone: string;
  /** motif court, ex. « Remboursement », « Billet non reçu ». */
  subject: string;
  /** résumé de la demande (rédigé par l'assistant à partir de la conversation). */
  message: string;
  status: 'open' | 'done';
  createdAt: string;
}

export interface Store {
  artists: StoredArtist[];
  events: StoredEvent[];
  /** photos de galerie par slug d'édition (statique OU admin). data URLs. */
  galleries: Record<string, string[]>;
  announcements: StoredAnnouncement[];
  tickets: StoredTicket[];
}

const EMPTY: Store = {
  artists: [],
  events: [],
  galleries: {},
  announcements: [],
  tickets: [],
};

function shapeGalleries(v: unknown): Record<string, string[]> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, string[]> = {};
  for (const [slug, arr] of Object.entries(v as Record<string, unknown>)) {
    if (Array.isArray(arr)) {
      const imgs = arr.filter((x): x is string => typeof x === 'string' && x.length > 0);
      if (imgs.length) out[slug] = imgs;
    }
  }
  return out;
}

/** Complète un événement d'un ancien format (champ `time` manquant). */
function normalizeEvent(raw: Partial<StoredEvent>): StoredEvent {
  return {
    ...(raw as StoredEvent),
    time: typeof raw.time === 'string' ? raw.time : '',
    flyerW: typeof raw.flyerW === 'number' ? raw.flyerW : 0,
    flyerH: typeof raw.flyerH === 'number' ? raw.flyerH : 0,
    lineup: Array.isArray(raw.lineup) ? raw.lineup : [],
    palette: Array.isArray(raw.palette) ? raw.palette : [],
    hidden: raw.hidden === true, // absent dans les anciens enregistrements
  };
}

function shape(parsed: Partial<Store>): Store {
  return {
    artists: Array.isArray(parsed.artists)
      ? parsed.artists.map((a) => normalizeArtist(a as StoredArtist))
      : [],
    events: Array.isArray(parsed.events)
      ? (parsed.events as StoredEvent[]).map(normalizeEvent)
      : [],
    galleries: shapeGalleries(parsed.galleries),
    announcements: Array.isArray(parsed.announcements)
      ? (parsed.announcements as StoredAnnouncement[]).filter(
          (a) => a && typeof a.text === 'string',
        )
      : [],
    tickets: Array.isArray(parsed.tickets)
      ? (parsed.tickets as StoredTicket[])
          .filter((t) => t && typeof t.email === 'string')
          .map((t) => ({ ...t, status: t.status === 'done' ? 'done' : 'open' }))
      : [],
  };
}

export async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    return shape(JSON.parse(raw) as Partial<Store>);
  } catch {
    return { ...EMPTY };
  }
}

export async function writeStore(store: Store): Promise<void> {
  const json = `${JSON.stringify(store, null, 2)}\n`;

  // PRODUCTION (GITHUB_TOKEN présent) : commit sur GitHub → auto-deploy Vercel.
  // Le FS de l'hébergeur étant en lecture seule, aucune écriture disque ici.
  if (githubStoreEnabled()) {
    await commitStoreToGithub(json);
    return;
  }

  // LOCAL : écriture disque directe (rechargement immédiat en dev).
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, json, 'utf8');
}

/** Version synchrone pour la lecture au rendu des pages publiques. */
export function readStoreSync(): Store {
  try {
    return shape(JSON.parse(readFileSync(FILE, 'utf8')) as Partial<Store>);
  } catch {
    return { ...EMPTY };
  }
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
