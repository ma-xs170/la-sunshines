// npm run test:unit — règles pures de l'espace organisateur.
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventState, progress, STATE_LABEL } from '../../lib/organizer/status.ts';
import { containsLink } from '../../lib/organizer/message-rules.ts';

const now = Date.parse('2026-11-01T12:00:00Z');
const base = { status: 'published', ticketing_enabled: true, starts_at: '2026-11-07T00:00:00Z', capacity: 100, sold: 10, reserved: 0 };

test('statut : brouillon / en vente / complet / terminé / annulé', () => {
  assert.equal(eventState({ ...base, status: 'draft' }, now), 'draft');
  assert.equal(eventState({ ...base, ticketing_enabled: false }, now), 'draft');
  assert.equal(eventState(base, now), 'on_sale');
  assert.equal(eventState({ ...base, sold: 90, reserved: 10 }, now), 'sold_out');
  assert.equal(eventState({ ...base, sold: 100 }, now), 'sold_out');
  assert.equal(eventState({ ...base, starts_at: '2026-10-01T00:00:00Z' }, now), 'ended');
  assert.equal(eventState({ ...base, status: 'closed' }, now), 'ended');
  assert.equal(eventState({ ...base, status: 'cancelled' }, now), 'cancelled');
  assert.equal(STATE_LABEL.sold_out, 'Complet');
});
test('un événement reste « à venir » jusqu\'à 12 h après son début', () => {
  const start = '2026-11-01T06:00:00Z';
  assert.equal(eventState({ ...base, starts_at: start }, Date.parse('2026-11-01T17:59:00Z')), 'on_sale');
  assert.equal(eventState({ ...base, starts_at: start }, Date.parse('2026-11-01T18:01:00Z')), 'ended');
});
test('progression : vendus + réservations en cours, jamais au-delà de 100 %', () => {
  assert.deepEqual(progress(38, 5, 100), { soldPct: 38, reservedPct: 5, totalPct: 38 });
  assert.equal(progress(0, 0, 0).totalPct, 0);
  const full = progress(100, 20, 100);
  assert.equal(full.soldPct + full.reservedPct, 100);
  const over = progress(80, 50, 100);
  assert.equal(over.soldPct + over.reservedPct, 100);
  assert.equal(progress(150, 0, 100).soldPct, 100);
});
test('message d\'information : aucun lien accepté', () => {
  for (const t of ['https://boutique.example/promo', 'http://x.io', 'www.promo.fr', 'va sur promo.shop', 'bit.ly/abc', 'lien.com']) assert.equal(containsLink(t), true, t);
  for (const t of ['Les portes ouvrent à 19 h.', 'Pense à ta pièce d\'identité (12–17 ans).', 'Parking : rue du Test, Pointe-à-Pitre.', 'Prévois 5,50 € en espèces ? Non : paiement en ligne.']) assert.equal(containsLink(t), false, t);
  assert.equal(containsLink('ok', 'mais www.piege.fr'), true);
});

// ---- interface (phase 1) : rôles, checklist, recherche / puces / onglets / filtres
import { can, navFor, activeNav } from '../../lib/organizer/roles.ts';
import { checklist, canPublish, legalComplete } from '../../lib/organizer/readiness.ts';
import { filterEvents, tabCounts, tabOf, NO_FILTERS } from '../../lib/organizer/browse.ts';

test('rôles : propriétaire = tout, gestionnaire = tout sauf légal / paiement, staff = scan seul', () => {
  for (const cap of ['scan', 'manage', 'owner']) { assert.equal(can('owner', cap), true); assert.equal(can('admin', cap), true); }
  assert.deepEqual(['scan', 'manage', 'owner'].map((c) => can('manager', c)), [true, true, false]);
  assert.deepEqual(['scan', 'manage', 'owner'].map((c) => can('staff', c)), [true, false, false]);
  for (const cap of ['scan', 'manage', 'owner']) { assert.equal(can(null, cap), false); assert.equal(can('viewer', cap), false); }
});
test('barre du haut : entrées selon le rôle, jamais d\'entrée « Marketing » vide', () => {
  const labels = (r) => navFor(r).map((i) => i.label);
  assert.deepEqual(labels('owner'), ['Événements', 'Participants', 'Analyse', 'Paiements']);
  assert.deepEqual(labels('manager'), ['Événements', 'Participants', 'Analyse']);
  assert.deepEqual(labels('staff'), ['Événements']);
  assert.equal(labels('admin').includes('Marketing'), false);
  assert.equal(activeNav('/organisateur'), '/organisateur');
  assert.equal(activeNav('/organisateur/evenements/x'), '/organisateur');
  assert.equal(activeNav('/organisateur/analyse'), '/organisateur/analyse');
  assert.equal(activeNav('/organisateur/actualites'), null);
});
test('checklist : étapes cochées selon les informations de l\'organisation', () => {
  const org = { name: 'THE MOUV', siret: '', responsible_name: '', address: '', contact_email: '', stripe_ready: false };
  assert.deepEqual(checklist(org).map((s) => s.done), [false, false, false]);
  assert.equal(legalComplete({ ...org, address: '1 rue', siret: '10425394300013' }), true);
  assert.equal(legalComplete({ ...org, address: '1 rue', responsible_name: 'Dupont Jean' }), true);   // nom + prénom à défaut de SIRET
  assert.equal(legalComplete({ ...org, siret: '10425394300013' }), false);                            // adresse obligatoire
  const full = { ...org, address: '1 rue', siret: '10425394300013', contact_email: 'a@b.fr', stripe_ready: true };
  assert.equal(canPublish(full), true);
  assert.equal(canPublish({ ...full, stripe_ready: false }), false);
});
const ev = (o) => ({ slug: 'x', title: 'X', startsAt: '2026-11-01T22:00:00Z', dateLabel: '', venue: 'Salle A', state: 'on_sale', archived: false, sold: 0, reserved: 0, capacity: 10, entered: 0, revenueCents: 0, hasFlyer: false, organizerName: 'THE MOUV', ...o });
test('liste : onglets, puces, recherche sans accents, lieu et période', () => {
  const list = [ev({ slug: 'a', title: 'La Nuit Des Ombres' }), ev({ slug: 'b', title: 'Été brûlant', state: 'draft', venue: 'Plage', startsAt: '2026-12-05T22:00:00Z' }),
    ev({ slug: 'c', state: 'ended' }), ev({ slug: 'd', archived: true, state: 'ended' }), ev({ slug: 'e', state: 'cancelled' }), ev({ slug: 'f', state: 'sold_out' })];
  const slugs = (f) => filterEvents(list, { ...NO_FILTERS, ...f }).map((e) => e.slug).join('');
  assert.equal(slugs({}), 'abf');
  assert.equal(slugs({ tab: 'past' }), 'ce');
  assert.equal(slugs({ tab: 'archives' }), 'd');
  assert.deepEqual(tabCounts(list), { upcoming: 3, past: 2, archives: 1 });
  assert.equal(tabOf(list[3]), 'archives');
  assert.equal(slugs({ chip: 'on_sale' }), 'af');          // « complet » = publié
  assert.equal(slugs({ chip: 'draft' }), 'b');
  assert.equal(slugs({ chip: 'ended', tab: 'past' }), 'c');
  assert.equal(slugs({ q: 'ete BRULANT' }), 'b');
  assert.equal(slugs({ q: 'nuit ombres' }), '');            // la recherche est une sous-chaîne, pas un « et » de mots
  assert.equal(slugs({ q: 'plage' }), 'b');
  assert.equal(slugs({ venue: 'Plage' }), 'b');
  assert.equal(slugs({ from: '2026-12-01' }), 'b');
  assert.equal(slugs({ to: '2026-11-30' }), 'af');
  assert.equal(slugs({ from: '2026-11-01', to: '2026-11-01' }), 'af');  // bornes incluses (jour entier, heure de Guadeloupe)
});

// ---- actualités : nettoyage du texte (aucun HTML), image https seulement
import { cleanNewsTitle, cleanNewsBody, safeImageUrl, paragraphs, isNewsCategory } from '../../lib/news/text.ts';

test('actualités : le contenu est du texte simple, sans chevrons ni caractères de contrôle', () => {
  assert.equal(cleanNewsTitle('  Nouvelle <b>page</b>\n Analyse '), 'Nouvelle b page /b Analyse');
  assert.equal(cleanNewsTitle('<img src=x onerror=alert(1)>'), 'img src=x onerror=alert(1)');
  assert.equal(cleanNewsBody('Ligne 1\r\nLigne 2 <script>alert(1)</script>\u0000\u0007'), 'Ligne 1\nLigne 2 scriptalert(1)/script');
  assert.equal(cleanNewsBody('a\n\n\n\n\nb'), 'a\n\nb');
  assert.equal(cleanNewsTitle('x'.repeat(300)).length, 120);
  assert.equal(/[<>]/.test(cleanNewsBody('<<>>a<')), false);
  assert.deepEqual(paragraphs('un\ndeux\n\ntrois'), ['un\ndeux', 'trois']);
});
test('actualités : image = URL https uniquement', () => {
  assert.equal(safeImageUrl('https://cdn.example/a.png'), 'https://cdn.example/a.png');
  for (const bad of ['http://x.io/a.png', 'javascript:alert(1)', 'data:image/png;base64,AAA', '//x.io/a.png', 'https://x.io/a b.png', 'https://x.io/"onerror=1', 'ftp://x', 'https://' + 'a'.repeat(600)]) assert.equal(safeImageUrl(bad), null, bad);
  assert.equal(safeImageUrl(''), null); assert.equal(safeImageUrl(null), null);
});
test('actualités : catégories connues', () => {
  for (const c of ['nouveaute', 'important', 'maintenance']) assert.equal(isNewsCategory(c), true);
  for (const c of ['promo', '', null, 'IMPORTANT']) assert.equal(isNewsCategory(c), false);
});

import { accountMenu, eventMenu, visibleMenu, eventSlugOf, isActiveHref, activeGroupId, crumbs } from '../../lib/organizer/menu.ts';
const caps = { admin: () => true, owner: () => true, manager: (c) => c !== 'owner', staff: (c) => c === 'scan' };

test('menu : le contexte évènement se déclenche sur /evenements/<slug>, pas sur /nouveau', () => {
  assert.equal(eventSlugOf('/organisateur/evenements/la-nuit-des-ombres'), 'la-nuit-des-ombres');
  assert.equal(eventSlugOf('/organisateur/evenements/la-nuit-des-ombres/tarifs'), 'la-nuit-des-ombres');
  assert.equal(eventSlugOf('/organisateur/evenements/nouveau'), null);
  assert.equal(eventSlugOf('/organisateur/evenements'), null);
  assert.equal(eventSlugOf('/organisateur'), null);
});

test('menu : filtré par rôle (le staff ne voit que le contrôle d’accès)', () => {
  const labels = (role) => visibleMenu(eventMenu('x'), caps[role]).flatMap((g) => g.items.map((i) => i.label));
  assert.deepEqual(labels('staff'), ['Tableau de bord', 'Scan à l’entrée', 'Liste d’entrée']);
  assert.ok(!labels('manager').includes('Récapitulatif'));
  assert.ok(labels('owner').includes('Récapitulatif'));
  assert.deepEqual(visibleMenu(accountMenu(), caps.staff).map((g) => g.id), ['dashboard', 'events', 'news', 'help']);
  assert.ok(visibleMenu(accountMenu(), caps.staff).find((g) => g.id === 'events').items.every((i) => i.label === 'Tous mes évènements'));
});

test('menu : aucune entrée cliquable sans page, aucun href en double', () => {
  for (const menu of [accountMenu(), eventMenu('x')]) {
    const all = menu.flatMap((g) => g.items);
    const hrefs = all.filter((i) => i.href).map((i) => i.href);
    assert.equal(new Set(hrefs).size, hrefs.length);
    assert.ok(all.some((i) => !i.href), 'les pages non construites sont marquées « bientôt »');
  }
});

test('menu : entrée active selon le chemin et l’onglet', () => {
  assert.equal(isActiveHref('/organisateur/evenements/x', '/organisateur/evenements/x', null), true);
  assert.equal(isActiveHref('/organisateur/evenements/x', '/organisateur/evenements/x', 'scan'), false);
  assert.equal(isActiveHref('/organisateur/evenements/x?onglet=scan', '/organisateur/evenements/x', 'scan'), true);
  assert.equal(isActiveHref(undefined, '/organisateur', null), false);
  assert.equal(activeGroupId(eventMenu('x'), '/organisateur/evenements/x', 'tarifs'), 'ev-tickets');
  assert.equal(activeGroupId(accountMenu(), '/organisateur/paiements', null), 'org');
});

test('menu : le sous-titre « Distribuer » suit le filtrage', () => {
  const sales = (role) => visibleMenu(eventMenu('x'), caps[role]).find((g) => g.id === 'ev-sales');
  assert.deepEqual(sales('manager').sub, { after: 2, label: 'Distribuer' });
});

test('fil d’Ariane', () => {
  assert.deepEqual(crumbs('/organisateur').map((c) => c.label), ['Espace organisateur']);
  assert.deepEqual(crumbs('/organisateur/evenements/x').map((c) => c.label), ['Espace organisateur', 'Mes évènements', 'Évènement']);
  assert.equal(crumbs('/organisateur/paiements').at(-1).href, undefined);
});

import { variation } from '../../lib/organizer/variation.ts';
test('variation : période précédente à zéro = « nouveau », jamais d’infini', () => {
  assert.deepEqual(variation(100, 0), { text: 'nouveau', tone: 'up' });
  assert.deepEqual(variation(0, 0), { text: '—', tone: 'flat' });
  assert.deepEqual(variation(150, 100), { text: '+50 %', tone: 'up' });
  assert.deepEqual(variation(50, 100), { text: '−50 %', tone: 'down' });
  assert.deepEqual(variation(100, 100), { text: '0 %', tone: 'flat' });
});
