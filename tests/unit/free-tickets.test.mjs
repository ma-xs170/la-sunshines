// npm run test:unit — règles pures des tarifs gratuits (0 €) : validation, formats, frais.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tierSaveSchema } from '../../lib/ticketing/schemas.ts';
import { computeFee, euroToCents, formatPrice, priceError, isFree } from '../../lib/ticketing/time.ts';

const tier = (price_cents, extra = {}) => ({
  name: 'Tarif', description: '', price_cents, quantity_total: 10, max_per_order: 2,
  sales_start: null, sales_end: null, is_active: true, sort_order: 0, ...extra,
});

test('tarif à 0 € accepté (évènement / billet gratuit)', () => {
  assert.equal(tierSaveSchema.safeParse(tier(0)).success, true);
  assert.equal(tierSaveSchema.safeParse(tier(0, { max_per_account: 3 })).success, true);
});
test('prix 0,30 € refusé avec un message clair (Stripe ne peut pas l’encaisser)', () => {
  for (const c of [1, 30, 49]) {
    const r = tierSaveSchema.safeParse(tier(c));
    assert.equal(r.success, false, String(c));
    assert.match(r.error.issues[0].message, /Stripe/);
    assert.match(priceError(c), /Stripe/);
  }
});
test('prix négatif refusé ; 0,50 € et plus acceptés', () => {
  assert.equal(tierSaveSchema.safeParse(tier(-1)).success, false);
  assert.match(priceError(-100), /négatif/);
  for (const c of [50, 1500, 1000000]) { assert.equal(tierSaveSchema.safeParse(tier(c)).success, true, String(c)); assert.equal(priceError(c), null); }
  assert.equal(tierSaveSchema.safeParse(tier(1000001)).success, false);
});
test('plafond par compte : entier entre 1 et 20', () => {
  assert.equal(tierSaveSchema.safeParse(tier(0, { max_per_account: 0 })).success, false);
  assert.equal(tierSaveSchema.safeParse(tier(0, { max_per_account: 21 })).success, false);
});
test('saisie « 0 » = gratuit, champ vide ≠ gratuit', () => {
  assert.equal(euroToCents('0'), 0);
  assert.equal(euroToCents('0,00'), 0);
  assert.ok(Number.isNaN(euroToCents('')));
  assert.ok(Number.isNaN(euroToCents('  ')));
  assert.equal(euroToCents('0,30'), 30);
  assert.equal(priceError(euroToCents('')), 'Indique un prix.');
});
test('affichage : « Gratuit » pour 0, prix sinon', () => {
  assert.equal(formatPrice(0), 'Gratuit');
  assert.match(formatPrice(1500), /15,00/);
  assert.equal(isFree(0), true);
  assert.equal(isFree(50), false);
});
test('frais : jamais sur une commande gratuite (% ni frais fixe) ; panier mixte = frais sur la seule partie payante', () => {
  assert.equal(computeFee(0, 10, 50), 0);
  assert.equal(computeFee(3000, 10, 50), 350); // 2 × 15,00 € payants (+ un billet gratuit qui ajoute 0)
});
