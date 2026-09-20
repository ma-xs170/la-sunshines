// npm run test:unit — l'événement éditorial de test vient du code, seulement en mode de test, jamais en production.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withTestEvent, testStoredEvent, TEST_EDITION_SLUG } from '../../lib/testEdition.ts';

const other = [{ slug: 'autre' }];
const NOW = Date.parse('2026-09-20T12:00:00Z');

test('sans mode de test : aucun événement de test (production comprise)', () => {
  assert.deepEqual(withTestEvent(other, {}), other);
  assert.deepEqual(withTestEvent(other, { TICKETING_FORCE_MODE: 'internal', VERCEL_ENV: 'production' }), other);
  assert.deepEqual(withTestEvent(other, { TICKETING_FORCE_MODE: 'native' }), other);
});
test('avec le mode de test : l\'événement « test-billetterie » est ajouté', () => {
  const r = withTestEvent(other, { TICKETING_FORCE_MODE: 'internal' }, NOW);
  assert.equal(r.length, 2);
  assert.equal(r[1].slug, TEST_EDITION_SLUG);
  assert.equal(r[1].hidden, false);
});
test('content.json prioritaire : pas de doublon', () => {
  const mine = [{ slug: TEST_EDITION_SLUG, name: 'Mon test' }];
  assert.deepEqual(withTestEvent(mine, { TICKETING_FORCE_MODE: 'internal' }), mine);
});
test('la date est toujours dans le futur (60 jours)', () => {
  assert.equal(testStoredEvent(NOW).date, '2026-11-19');
  assert.ok(Date.parse(testStoredEvent(NOW).date) > NOW);
});
