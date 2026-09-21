import test from 'node:test';
import assert from 'node:assert/strict';
import { siretValid, stepErrors, submitSchema, docOk } from '../../lib/organizer/signup.ts';

test('SIRET : format et clé de Luhn', () => {
  assert.equal(siretValid('10665995600010'), true);
  assert.equal(siretValid('106 659 956 00010'), true);
  assert.equal(siretValid('10665995600011'), false);
  assert.equal(siretValid('123'), false);
});
test('étape structure : messages en français, champ par champ', () => {
  const e = stepErrors('structure', { name: '', legal_form: '', siret: '123', address: '', postal_code: '9710', city: '' });
  assert.equal(e.name, 'Le nom de la structure est obligatoire.');
  assert.ok(e.legal_form && e.siret && e.address && e.postal_code && e.city);
  assert.deepEqual(stepErrors('structure', { name: 'Asso', legal_form: 'association', siret: '', address: '1 rue X', postal_code: '97100', city: 'Basse-Terre' }), {});
});
test('étape activité : conditions obligatoires', () => {
  const e = stepErrors('activity', { description: 'court', regions: [], events_per_year: '4-10', accept_terms: false });
  assert.ok(e.description && e.regions && e.accept_terms);
});
test('envoi : pièce d’identité et justificatif obligatoires, chemins privés uniquement', () => {
  const data = { name: 'A', legal_form: 'association', siret: '', address: '1 rue X', postal_code: '97100', city: 'B', responsible_first: 'A', responsible_last: 'B', contact_email: 'a@b.fr', phone: '0590000000', website: '', description: 'Une association de test très active.', regions: ['guadeloupe'], events_per_year: '1-3', accept_terms: true };
  const doc = (kind, path = 'orgdocs/a1.pdf') => ({ kind, path, name: 'x.pdf', size: 10, mime: 'application/pdf' });
  assert.equal(submitSchema.safeParse({ data, docs: [doc('identity')] }).success, false);
  assert.equal(submitSchema.safeParse({ data, docs: [doc('identity'), doc('legal', 'orgdocs/b2.pdf')] }).success, true);
  assert.equal(submitSchema.safeParse({ data, docs: [doc('identity'), doc('legal', 'https://evil/x.pdf')] }).success, false);
  assert.equal(submitSchema.safeParse({ data, docs: [doc('identity'), doc('legal', 'orgdocs/../x.pdf')] }).success, false);
});
test('pièces : types et taille', () => {
  assert.equal(docOk('application/pdf', 100), true);
  assert.equal(docOk('image/svg+xml', 100), false);
  assert.equal(docOk('application/pdf', 11 * 1024 * 1024), false);
});
