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
  /** Bannière personnalisée (data URL) choisie par l'artiste depuis son espace.
   *  '' → repli automatique sur le flyer d'une de ses éditions (cf. page publique). */
  banner: string;
  /** réseaux — URL complète ou pseudo ; '' = non affiché sur le profil. */
  instagram: string;
  tiktok: string;
  soundcloud: string;
  email: string;
  /** Page réclamée + vérifiée par l'artiste (badge « Certifié »). Défaut false.
   *  Seul CE booléen persiste ; la pièce d'identité n'est jamais dans le Store. */
  verified: boolean;
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
    banner: typeof raw.banner === 'string' ? raw.banner : '',
    instagram: typeof raw.instagram === 'string' ? raw.instagram : '',
    tiktok: typeof raw.tiktok === 'string' ? raw.tiktok : '',
    soundcloud: typeof raw.soundcloud === 'string' ? raw.soundcloud : '',
    email: typeof raw.email === 'string' ? raw.email : '',
    verified: raw.verified === true,
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
  /** Accroche / description courte (affichée comme tagline sur le site). Peut être vide. */
  description: string;
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
  /** ARCHIVÉ : rangé côté admin (onglet Archives), invisible publiquement comme
   *  `hidden`. Réversible. Défaut false. */
  archived: boolean;
  /** Programme horaire (running order). Optionnel, [] par défaut. */
  schedule: ScheduleEntry[];
  createdAt: string;
}

export interface ScheduleEntry {
  id: string;
  /** créneau au format « HH:MM » (ex. « 18:00 »). Chaque entrée garde SON heure ;
   *  le regroupement par créneau identique est purement un traitement d'affichage. */
  time: string;
  /** nom d'artiste (du line-up ou saisie libre). '' possible si label seul. */
  artistName: string;
  /** intitulé optionnel, ex. « Ouverture des portes », « Live », « Set DJ ». */
  label: string;
  /** tête d'affiche — mise en valeur visuelle sur l'affichage public. */
  headliner: boolean;
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

/**
 * Demande de vérification d'une page artiste (réclamation avec pièce d'identité).
 * La pièce elle-même est sur Vercel Blob (accès PRIVÉ) — jamais ici. Seuls
 * `blobUrl`/`blobPathname` (pointeurs vers un blob non public) transitent, et la
 * demande est SUPPRIMÉE du Store dès que l'admin a statué.
 */
export interface VerificationRequest {
  id: string;
  artistSlug: string;
  /** nom déclaré par le demandeur. */
  name: string;
  email: string;
  blobUrl: string;
  blobPathname: string;
  fileType: string;
  createdAt: string;
}

/**
 * Jeton de connexion à usage unique (« magic link ») pour l'espace artiste.
 * Émis à l'approbation d'une vérification, ou à la demande depuis la page
 * publique si l'artiste est déjà vérifié. Court : expire vite, `used` une fois.
 */
export interface ArtistLoginToken {
  token: string;
  artistSlug: string;
  /** timestamp (ms) d'expiration. */
  expiresAt: number;
  used: boolean;
  createdAt: string;
}

/** Abonnement d'un visiteur aux annonces d'un artiste. */
export interface Subscription {
  email: string;
  artistSlug: string;
  /** jeton opaque pour le désabonnement en 1 clic. */
  token: string;
  createdAt: string;
}

export interface Store {
  artists: StoredArtist[];
  events: StoredEvent[];
  /** photos de galerie par slug d'édition (statique OU admin). data URLs. */
  galleries: Record<string, string[]>;
  announcements: StoredAnnouncement[];
  tickets: StoredTicket[];
  verificationRequests: VerificationRequest[];
  subscriptions: Subscription[];
  /** clés `${eventSlug}::${email}` déjà notifiées — anti-doublon des emails. */
  notifiedSubscribers: string[];
  /** jetons « magic link » de l'espace artiste (courte durée, usage unique). */
  artistLoginTokens: ArtistLoginToken[];
}

const EMPTY: Store = {
  artists: [],
  events: [],
  galleries: {},
  announcements: [],
  tickets: [],
  verificationRequests: [],
  subscriptions: [],
  notifiedSubscribers: [],
  artistLoginTokens: [],
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
    description: typeof raw.description === 'string' ? raw.description : '',
    flyerW: typeof raw.flyerW === 'number' ? raw.flyerW : 0,
    flyerH: typeof raw.flyerH === 'number' ? raw.flyerH : 0,
    lineup: Array.isArray(raw.lineup) ? raw.lineup : [],
    palette: Array.isArray(raw.palette) ? raw.palette : [],
    hidden: raw.hidden === true, // absent dans les anciens enregistrements
    archived: raw.archived === true,
    schedule: Array.isArray(raw.schedule)
      ? (raw.schedule as Partial<ScheduleEntry>[])
          .filter((s) => s && typeof s === 'object')
          .map((s) => ({
            id: typeof s.id === 'string' && s.id ? s.id : newId(),
            time: typeof s.time === 'string' ? s.time : '',
            artistName: typeof s.artistName === 'string' ? s.artistName : '',
            label: typeof s.label === 'string' ? s.label : '',
            headliner: s.headliner === true,
          }))
      : [],
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
    verificationRequests: Array.isArray(parsed.verificationRequests)
      ? (parsed.verificationRequests as VerificationRequest[]).filter(
          (v) => v && typeof v.artistSlug === 'string' && typeof v.blobPathname === 'string',
        )
      : [],
    subscriptions: Array.isArray(parsed.subscriptions)
      ? (parsed.subscriptions as Subscription[]).filter(
          (s) => s && typeof s.email === 'string' && typeof s.artistSlug === 'string' && typeof s.token === 'string',
        )
      : [],
    notifiedSubscribers: Array.isArray(parsed.notifiedSubscribers)
      ? (parsed.notifiedSubscribers as unknown[]).filter(
          (x): x is string => typeof x === 'string',
        )
      : [],
    artistLoginTokens: Array.isArray(parsed.artistLoginTokens)
      ? (parsed.artistLoginTokens as ArtistLoginToken[])
          .filter(
            (t) =>
              t &&
              typeof t.token === 'string' &&
              typeof t.artistSlug === 'string' &&
              typeof t.expiresAt === 'number',
          )
          .map((t) => ({ ...t, used: t.used === true }))
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
