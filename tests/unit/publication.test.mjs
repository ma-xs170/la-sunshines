import test from 'node:test';
import assert from 'node:assert/strict';
import { missingChecks, isReady, checkHref, mailRecipients, TEST_MAIL_TO, CHECK_LABEL } from '../../lib/organizer/publication.ts';

const all = { description: true, date: true, venue: true, visual: true, tickets: true };
test('checklist : points manquants dans l’ordre', () => {
  assert.deepEqual(missingChecks({ ...all, visual: false, description: false }), ['description', 'visual']);
  assert.equal(isReady(all), true);
  assert.equal(isReady({ ...all, tickets: false }), false);
  assert.ok(Object.values(CHECK_LABEL).every((l) => l.length > 3));
});
test('liens de correction selon le mode de billetterie', () => {
  assert.equal(checkHref('tickets', 'x', 'internal'), '/organisateur/evenements/x?onglet=tarifs');
  assert.equal(checkHref('tickets', 'x', 'bizouk'), '/organisateur/evenements/x/billetterie');
  assert.equal(checkHref('visual', 'x', 'none'), '/organisateur/evenements/x/visuel');
});
test('e-mails : en test tout part vers Mathis uniquement', () => {
  assert.deepEqual(mailRecipients(['orga@x.fr', 'admin@x.fr'], false), { to: [TEST_MAIL_TO], redirected: true });
  assert.deepEqual(mailRecipients([], true), { to: [TEST_MAIL_TO], redirected: true });
  assert.deepEqual(mailRecipients(['A@x.fr', 'a@x.fr', 'pas un mail'], true), { to: ['a@x.fr'], redirected: false });
});
