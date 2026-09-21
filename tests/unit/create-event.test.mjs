import test from 'node:test';
import assert from 'node:assert/strict';
import { createSchema, infoErrors, zonedIso, slugify, selectable, nextSteps } from '../../lib/organizer/create-event.ts';

const base = { org: '11111111-1111-4111-8111-111111111111', mode: 'none', title: 'La Nuit des Ombres 2', event_type: 'Soirée', date: '2999-12-31', time: '22:00', venue_name: 'Salle X', city: 'Pointe-à-Pitre', region: 'guadeloupe', visibility: 'public' };
test('création valide', () => assert.equal(createSchema.safeParse(base).success, true));
test('champs invalides : messages en français', () => {
  const e = infoErrors({ ...base, title: 'ab', event_type: '', date: '', time: '', venue_name: '', city: '', region: 'mars', visibility: '' });
  for (const k of ['title', 'event_type', 'date', 'time', 'venue_name', 'city', 'region', 'visibility']) assert.ok(e[k], k);
  assert.equal(e.title, 'Le titre doit faire au moins 3 caractères.');
});
test('date passée refusée', () => assert.ok(infoErrors({ ...base, date: '2020-01-01' }).date));
test('mode Bizouk : code obligatoire et vérifié', () => {
  assert.equal(createSchema.safeParse({ ...base, mode: 'bizouk' }).success, false);
  assert.equal(createSchema.safeParse({ ...base, mode: 'bizouk', bizouk_code: '<script>alert(1)</script>' }).success, false);
  assert.equal(createSchema.safeParse({ ...base, mode: 'bizouk', bizouk_code: '<iframe src="https://evil.com/stores/reservation/place?event=1"></iframe>' }).success, false);
  assert.equal(createSchema.safeParse({ ...base, mode: 'bizouk', bizouk_code: '<iframe src="https://www.bizouk.com/stores/reservation/place?event=128267&widget=1"></iframe>' }).success, true);
});
test('fuseaux : Antilles UTC−4, France heure de Paris', () => {
  assert.equal(zonedIso('2027-01-15', '22:00', 'guadeloupe'), '2027-01-16T02:00:00.000Z');
  assert.equal(zonedIso('2027-01-15', '22:00', 'france'), '2027-01-15T21:00:00.000Z');
  assert.equal(zonedIso('2027-07-15', '22:00', 'france'), '2027-07-15T20:00:00.000Z');
  assert.equal(zonedIso('nope', '22:00', 'france'), null);
});
test('slug et sélection des organisations', () => {
  assert.equal(slugify('Été Brûlant : Édition #2'), 'ete-brulant-edition-2');
  assert.equal(selectable({ status: 'approved' }), true);
  assert.equal(selectable({ status: 'pending' }), false);
  assert.equal(selectable({ status: 'suspended' }), false);
});
test('prochaines étapes', () => {
  const s = nextSteps({ hasDescription: true, hasDresscode: false, hasFlyer: false, hasTiers: false, mode: 'internal', hasBizouk: false, published: false }, '/organisateur/evenements/x');
  assert.deepEqual(s.map((x) => x.done), [true, false, false, false, false]);
  assert.equal(s[3].label, 'Créer les tarifs');
});
