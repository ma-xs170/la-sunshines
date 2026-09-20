// npm run test:unit — l'interrupteur de test ne doit JAMAIS ouvrir la billetterie en production.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveForcedMode, forceModeIgnoredInProduction } from '../../lib/ticketing/force-mode.ts';

test('variable absente ou vide → aucun forçage', () => {
  assert.equal(resolveForcedMode({}), null);
  assert.equal(resolveForcedMode({ TICKETING_FORCE_MODE: '' }), null);
  assert.equal(resolveForcedMode({ VERCEL_ENV: 'preview' }), null);
});
test('local (VERCEL_ENV absent) → billetterie interne, y compris avec NODE_ENV=production (next start)', () => {
  assert.equal(resolveForcedMode({ TICKETING_FORCE_MODE: 'internal' }), 'native');
  assert.equal(resolveForcedMode({ TICKETING_FORCE_MODE: 'internal', NODE_ENV: 'production' }), 'native');
  assert.equal(resolveForcedMode({ TICKETING_FORCE_MODE: 'internal', VERCEL_ENV: 'development' }), 'native');
});
test('Preview → billetterie interne', () => {
  assert.equal(resolveForcedMode({ TICKETING_FORCE_MODE: 'internal', VERCEL_ENV: 'preview' }), 'native');
});
test('PRODUCTION → jamais, quelle que soit la casse ou les espaces', () => {
  for (const v of ['production', 'Production', 'PRODUCTION', ' production ']) {
    assert.equal(resolveForcedMode({ TICKETING_FORCE_MODE: 'internal', VERCEL_ENV: v }), null, `VERCEL_ENV=${JSON.stringify(v)}`);
  }
  assert.equal(resolveForcedMode({ TICKETING_FORCE_MODE: ' internal ', VERCEL_ENV: 'production', NODE_ENV: 'production' }), null);
});
test('toute autre valeur que « internal » n’active rien', () => {
  for (const v of ['native', '1', 'true', 'Internal', 'INTERNAL', 'yes', 'bizouk']) {
    assert.equal(resolveForcedMode({ TICKETING_FORCE_MODE: v }), null, v);
  }
});
test('avertissement quand la variable traîne en production', () => {
  assert.equal(forceModeIgnoredInProduction({ TICKETING_FORCE_MODE: 'internal', VERCEL_ENV: 'production' }), true);
  assert.equal(forceModeIgnoredInProduction({ TICKETING_FORCE_MODE: 'internal', VERCEL_ENV: 'preview' }), false);
  assert.equal(forceModeIgnoredInProduction({ VERCEL_ENV: 'production' }), false);
});
