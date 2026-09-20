// npm run test:unit — découpage, correspondance, type de ligne et plan d'enregistrement du Programme.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  linkArtistText, artistMatchKey, effectiveRowKind, isInfoLine, levenshtein,
  nearestArtist, planScheduleArtists, isUsableName,
} from '../../lib/artistLinks.ts';

const artists = [
  { name: 'SYXTEE', slug: 'dj-syxtee' },
  { name: 'Timalash', slug: 'timalash' },
  { name: 'Lil Scott', slug: 'lil-scott' },
  { name: 'TOMTOM', slug: 'dj-tomtom' },
  { name: 'Styll’One', slug: 'styllone' },
  { name: 'Zoé', slug: 'zoe' },
  { name: 'Duo A & B', slug: 'duo-a-b' },
  { name: 'DJ Buz', slug: 'buz' },
  { name: 'DJ Doms', slug: 'dj-doms' },
  { name: 'WIIXX', slug: 'wiixx', aliases: ['Wix'] },
  { name: 'DJ Dreezy', slug: 'dreezy' },
  { name: 'DJ Sosonne', slug: 'sosonne' },
];
const names = (t, slugs) => linkArtistText(t, artists, slugs).filter((s) => s.kind === 'name').map((s) => `${s.text}>${s.slug ?? '-'}`);
const links = (t, slugs) => names(t, slugs).filter((n) => !n.endsWith('>-'));
const plain = (t) => linkArtistText(t, artists).map((s) => s.text).join('');
const kinds = (t) => linkArtistText(t, artists).map((s) => `${s.kind}:${s.text}`);

test('clé : casse, accents, préfixes DJ/MC', () => {
  assert.equal(artistMatchKey('DJ Zoé'), 'zoe');
  assert.equal(artistMatchKey('MC  ZOE'), 'zoe');
  assert.equal(artistMatchKey('É'), 'e');
});

test('exemples : Sosonne · Dalton · LK', () => {
  assert.deepEqual(names('DJ Sosonne · DJ Dalton · DJ LK'), ['DJ Sosonne>sosonne', 'DJ Dalton>-', 'DJ LK>-']);
});
test('exemple : Ayou — Tchambou (tiret cadratin, deux noms, tiret en texte)', () => {
  assert.deepEqual(kinds('Ayou — Tchambou'), ['name:Ayou', 'sep: — ', 'name:Tchambou']);
});
test('exemple : Timalash & Lil Scott', () => {
  assert.deepEqual(links('Timalash & Lil Scott'), ['Timalash>timalash', 'Lil Scott>lil-scott']);
});
test('exemple : Dreezy Keyboard Show → artiste lié, reste en texte normal', () => {
  assert.deepEqual(kinds('Dreezy Keyboard Show'), ['name:Dreezy', 'text: Keyboard Show']);
  assert.deepEqual(links('Dreezy Keyboard Show'), ['Dreezy>dreezy']);
});
test('exemples : Syxtee (enregistré « DJ Syxtee »), Buz, Doms', () => {
  assert.deepEqual(links('Syxtee'), ['Syxtee>dj-syxtee']);
  assert.deepEqual(links('Buz'), ['Buz>buz']);
  assert.deepEqual(links('Doms'), ['Doms>dj-doms']);
});

test('tous les séparateurs, texte reconstitué à l’identique', () => {
  for (const t of [
    'Timalash — Lil Scott', 'Timalash – Lil Scott', 'Timalash - Lil Scott', 'Timalash / Lil Scott',
    'Timalash x Lil Scott', 'Timalash & Lil Scott', 'Timalash + Lil Scott', 'Timalash · Lil Scott',
    'Timalash, Lil Scott', 'Timalash feat. Lil Scott', 'Timalash ft. Lil Scott',
    'Timalash b2b Lil Scott', 'Timalash vs Lil Scott', 'Timalash VS. Lil Scott', 'Timalash—Lil Scott',
  ]) {
    assert.deepEqual(links(t), ['Timalash>timalash', 'Lil Scott>lil-scott'], t);
    assert.equal(plain(t), t, t);
  }
});
test('pièges : « et », lettres isolées, noms composés ne sont jamais coupés', () => {
  assert.deepEqual(names('Lil Scott'), ['Lil Scott>lil-scott']);
  assert.equal(names('Dega Youth et Jeune Aber').length, 1);
  assert.deepEqual(names('Xploz'), ['Xploz>-']);
  assert.deepEqual(names('Jeune-Aber'), ['Jeune-Aber>-']);
  assert.deepEqual(names('Duo A & B'), ['Duo A & B>duo-a-b']);
  assert.deepEqual(names('Max Vs'), ['Max Vs>-']); // « vs » sans espace après : pas un séparateur
});
test('pièges : « DJ » seul, accents, casse', () => {
  assert.deepEqual(links('DJ'), []);
  assert.equal(isUsableName('DJ'), false);
  assert.equal(isUsableName('mc'), false);
  assert.equal(isUsableName('É'), false); // un seul caractère
  assert.deepEqual(links('ZOÉ'), ['ZOÉ>zoe']);
  assert.deepEqual(links('zoe'), ['zoe>zoe']);
  assert.deepEqual(links('MC Timalash'), ['MC Timalash>timalash']);
  assert.deepEqual(links("Styll'One"), ["Styll'One>styllone"]);
});
test('pièges : doublons dans une même ligne', () => {
  assert.deepEqual(links('Buz · Buz'), ['Buz>buz', 'Buz>buz']);
  const plan = planScheduleArtists([{ artistName: 'Ayou · Ayou · ayou' }, { artistName: 'AYOU' }], artists);
  assert.deepEqual(plan.creates.map((c) => c.name), ['Ayou']);
});
test('alias et slug', () => {
  assert.deepEqual(links('Wix'), ['Wix>wiixx']);
  assert.deepEqual(links('tomtom'), ['tomtom>dj-tomtom']);
});

test('lien explicite prioritaire, slug supprimé ignoré', () => {
  assert.deepEqual(links('Le collectif', ['timalash']), ['Le collectif>timalash']);
  assert.deepEqual(links('Team A + Team B', ['timalash', 'lil-scott']), ['Team A>timalash', 'Team B>lil-scott']);
  assert.deepEqual(links('Timalash & Lil Scott', ['lil-scott']), ['Lil Scott>lil-scott']);
  assert.deepEqual(links('Timalash', ['inconnu']), ['Timalash>timalash']);
});

test('type de ligne : information vs artiste', () => {
  for (const t of ['Ouverture des portes', 'Fermeture des portes', 'Fin des festivités', 'Pause', "FIN DE L'ÉVÈNEMENT"]) {
    assert.equal(effectiveRowKind(t), 'info', t);
    assert.equal(isInfoLine(t), true, t);
  }
  assert.equal(effectiveRowKind('Buz'), 'artist');
  assert.equal(effectiveRowKind('Finn Wolfhard'), 'artist'); // « fin » seulement en mot entier
  assert.equal(effectiveRowKind('Pause', undefined, true), 'artist'); // dans un bloc : artiste par défaut
  assert.equal(effectiveRowKind('Buz', 'info'), 'info'); // choix explicite prioritaire
  assert.equal(effectiveRowKind('Ouverture des portes', 'artist'), 'artist');
});

test('fautes de frappe', () => {
  assert.equal(levenshtein('wiixx', 'wixx'), 1);
  assert.equal(nearestArtist('Wixx', artists)?.slug, 'wiixx');
  assert.equal(nearestArtist('Timalasch', artists)?.slug, 'timalash');
  assert.equal(nearestArtist('Ayou', artists), undefined);
  assert.equal(nearestArtist('Tchambou', artists), undefined);
  assert.equal(nearestArtist('Wiixx', artists), undefined); // exact : pas une « faute »
});

test('plan : liaisons, créations, propositions ; information jamais créée', () => {
  const plan = planScheduleArtists(
    [
      { artistName: 'Ouverture des portes' },
      { artistName: 'Buz' },
      { artistName: 'Ayou — Tchambou' },
      { artistName: 'Syxtee' },
      { artistName: 'Wixx' },
      { artistName: 'Dreezy Keyboard Show' },
      { artistName: 'Fin des festivités' },
      { artistName: 'DJ' },
      { artistName: 'Pause', kind: 'info' },
      { artistName: 'Portes VIP', kind: 'info' },
    ],
    artists,
  );
  assert.deepEqual(plan.links.map((l) => `${l.name}>${l.slug}`), ['Buz>buz', 'Syxtee>dj-syxtee', 'Dreezy>dreezy']);
  assert.deepEqual(plan.creates.map((c) => c.name), ['Ayou', 'Tchambou']);
  assert.deepEqual(plan.suggestions.map((s) => `${s.name}>${s.candidate.name}`), ['Wixx>WIIXX']);
});
test('plan : noms de l’organisation ignorés, lien explicite respecté', () => {
  const plan = planScheduleArtists(
    [{ artistName: 'DJ La Sunshines' }, { artistName: 'Le collectif', artistSlugs: ['timalash'] }],
    artists,
    { ignore: (n) => /sunshines/i.test(n) },
  );
  assert.deepEqual(plan.creates, []);
  assert.deepEqual(plan.links.map((l) => l.slug), ['timalash']);
});
