// npm run test:unit — liaison des noms du Programme aux profils artistes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { linkArtistText, artistMatchKey } from '../../lib/artistLinks.ts';

const artists = [
  { name: 'SYXTEE', slug: 'dj-syxtee' },
  { name: 'Timalash', slug: 'timalash' },
  { name: 'Lil Scott', slug: 'lil-scott' },
  { name: 'TOMTOM', slug: 'dj-tomtom' },
  { name: 'Styll’One', slug: 'styllone' },
  { name: 'Zoé', slug: 'zoe' },
  { name: 'Duo A & B', slug: 'duo-a-b' },
];
const links = (t, slugs) => linkArtistText(t, artists, slugs).filter((s) => s.slug).map((s) => `${s.text}>${s.slug}`);
const plain = (t) => linkArtistText(t, artists).map((s) => s.text).join('');

test('clé : casse, accents, préfixes DJ/MC', () => {
  assert.equal(artistMatchKey('DJ Zoé'), 'zoe');
  assert.equal(artistMatchKey('MC  ZOE'), 'zoe');
});
test('plusieurs artistes, séparateurs conservés en texte', () => {
  assert.deepEqual(links('Timalash & Lil Scott'), ['Timalash>timalash', 'Lil Scott>lil-scott']);
  assert.deepEqual(links('DJ Syxtee · DJ Tomtom, Zoé x Timalash feat. Lil Scott'),
    ['DJ Syxtee>dj-syxtee', 'DJ Tomtom>dj-tomtom', 'Zoé>zoe', 'Timalash>timalash', 'Lil Scott>lil-scott']);
  assert.equal(plain('Timalash & Lil Scott'), 'Timalash & Lil Scott'); // texte reconstitué à l'identique
});
test('nom inconnu ou ligne non-artiste → aucun lien', () => {
  assert.deepEqual(links('Ouverture des portes'), []);
  assert.deepEqual(links('DJ Sosonne · DJ Dalton · DJ LK'), []);
  assert.deepEqual(links('DJ Sosonne · DJ Syxtee'), ['DJ Syxtee>dj-syxtee']);
});
test('apostrophe typographique, slug, nom contenant un séparateur', () => {
  assert.deepEqual(links("Styll'One"), ["Styll'One>styllone"]);
  assert.deepEqual(links('tomtom'), ['tomtom>dj-tomtom']);
  assert.deepEqual(links('Duo A & B'), ['Duo A & B>duo-a-b']);
});
test('lien explicite prioritaire', () => {
  assert.deepEqual(links('Le collectif', ['timalash']), ['Le collectif>timalash']);
  assert.deepEqual(links('Team A + Team B', ['timalash', 'lil-scott']), ['Team A>timalash', 'Team B>lil-scott']);
  assert.deepEqual(links('Timalash & Lil Scott', ['lil-scott']), ['Lil Scott>lil-scott']);
});
test('slug explicite supprimé → ignoré, retour à l’automatique', () => {
  assert.deepEqual(links('Timalash', ['inconnu']), ['Timalash>timalash']);
  assert.deepEqual(links('Ouverture des portes', ['inconnu']), []);
});
