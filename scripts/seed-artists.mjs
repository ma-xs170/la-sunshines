// Crée une fiche artiste (data/content.json) pour chaque nom présent dans les
// éditions — headliner + line-up — afin que :
//   • le panneau /admin « Artistes » soit peuplé dès le départ ;
//   • les pills HEADLINER / LINE-UP des pages événement deviennent cliquables
//     (composant <ArtistName> -> /artistes/[slug]).
//
// Idempotent : relançable sans créer de doublon (comparaison sur le nom
// canonique). Les fiches créées n'ont ni photo ni bio ni réseaux — à compléter
// depuis /admin.
//
//   node scripts/seed-artists.mjs        (ou : npm run seed:artists)
//
// Source des noms « statiques » : lib/editions.ts (headliner + lineup).
// Le script lit aussi data/content.json -> events[] pour les éditions ajoutées
// via /admin. Re-lancer après avoir ajouté une édition avec de nouveaux noms.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/* Noms tels qu'écrits dans lib/editions.ts (2026-08). */
const STATIC_EDITION_ARTISTS = [
  // welcome-to-dominica
  'Dreezy', 'DJ Syxtee', 'Doms', 'Wiixx', 'Buz',
  // candy-land
  'Timalash', 'Lil Scott', 'Yoyo', 'KLM', 'Syxtee', 'Dreezy', 'Buz',
  // edition-picasso
  'Jeune Aber', 'Dega Youth', 'Lulux', "Styll'One", 'Buzz', 'Wiixx', 'Syxtee', 'Dreezy',
  // la-xploz-tropical-island
  'LATOP', 'LMS', 'DJ Tomtom', 'DJ Mano', 'DJ Doms',
  // before-christmas
  'Lms', 'Laydow', 'Dega Youth', 'Ti Manix', 'Cloclo', 'Tipitoff', 'KLM', 'Dyxonn', 'Weswes',
];

/* Doit rester aligné avec lib/artists.ts -> normalizeArtistName / lib/slug.ts -> slugify */
const norm = (s) =>
  s.toLowerCase().trim().replace(/\s+/g, ' ').replace(/^dj\s+/, '');

const slugify = (input) =>
  input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'artiste';

const uniqueSlug = (base, taken) => {
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
};

const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* Entre plusieurs graphies d'un même artiste, garde la « plus riche »
   (le plus de majuscules, puis la plus longue) : « DJ Syxtee » > « syxtee ». */
const better = (a, b) => {
  const up = (s) => (s.match(/[A-Z]/g) || []).length;
  if (up(a) !== up(b)) return up(a) > up(b) ? a : b;
  return a.length >= b.length ? a : b;
};

const FILE = path.join(process.cwd(), 'data', 'content.json');
const store = JSON.parse(readFileSync(FILE, 'utf8'));
store.artists = Array.isArray(store.artists) ? store.artists : [];
store.events = Array.isArray(store.events) ? store.events : [];
store.galleries = store.galleries && typeof store.galleries === 'object' ? store.galleries : {};
store.announcements = Array.isArray(store.announcements) ? store.announcements : [];

/* Noms venant aussi des événements créés via /admin */
const fromEvents = [];
for (const ev of store.events) {
  if (typeof ev.headliner === 'string') {
    fromEvents.push(...ev.headliner.split(/\s*·\s*/));
  }
  if (Array.isArray(ev.lineup)) fromEvents.push(...ev.lineup);
}

const ORG_RE = /^(dj\s+)?(la\s+)?(sunshines?|xploz)$/i;

/* Nom canonique -> meilleure graphie */
const display = new Map();
for (const raw of [...STATIC_EDITION_ARTISTS, ...fromEvents]) {
  const name = String(raw).trim();
  if (!name || ORG_RE.test(name)) continue;
  const key = norm(name);
  display.set(key, display.has(key) ? better(display.get(key), name) : name);
}

const existing = new Set(store.artists.map((a) => norm(a.name || '')));
const takenSlugs = new Set(store.artists.map((a) => a.slug).filter(Boolean));

let created = 0;
for (const [key, name] of display) {
  if (existing.has(key)) continue;
  const slug = uniqueSlug(slugify(name), takenSlugs);
  takenSlugs.add(slug);
  store.artists.push({
    id: newId(),
    slug,
    name,
    role: '',
    bio: '',
    image: '',
    instagram: '',
    tiktok: '',
    soundcloud: '',
    email: '',
    createdAt: new Date().toISOString(),
  });
  existing.add(key);
  created += 1;
  console.log(`  + ${name}  ->  /artistes/${slug}`);
}

writeFileSync(FILE, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
console.log(
  created
    ? `\n${created} fiche(s) artiste créée(s). Total : ${store.artists.length}.`
    : `Aucune nouvelle fiche (déjà à jour). Total : ${store.artists.length}.`,
);
