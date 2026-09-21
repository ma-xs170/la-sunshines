import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tierStatus, tierAlert } from '../../lib/organizer/status.ts';
import { eventLinks, previewPath, publicPath } from '../../lib/organizer/event-links.ts';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const base = { quantity_total: 100, sold: 10, reserved: 0 };

test('statut de tarif : en vente, épuisé, fermé, à venir', () => {
  assert.equal(tierStatus(base, NOW), 'on_sale');
  assert.equal(tierStatus({ ...base, sold: 95, reserved: 5 }, NOW), 'sold_out');
  assert.equal(tierStatus({ ...base, is_active: false }, NOW), 'closed');
  assert.equal(tierStatus({ ...base, archived: true }, NOW), 'closed');
  assert.equal(tierStatus({ ...base, sales_end: '2026-09-30T00:00:00Z' }, NOW), 'closed');
  assert.equal(tierStatus({ ...base, sales_start: '2026-10-05T00:00:00Z' }, NOW), 'upcoming');
  // fermé l'emporte sur épuisé ; à venir l'emporte sur épuisé
  assert.equal(tierStatus({ ...base, sold: 100, is_active: false }, NOW), 'closed');
});

test('alerte de stock : ok, bas, épuisé', () => {
  assert.equal(tierAlert(base), 'ok');
  assert.equal(tierAlert({ ...base, sold: 86 }), 'low');
  assert.equal(tierAlert({ ...base, sold: 100 }), 'out');
  assert.equal(tierAlert({ quantity_total: 4, sold: 3, reserved: 0 }), 'low');
  assert.equal(tierAlert({ quantity_total: 0, sold: 0, reserved: 0 }), 'ok');
});

test('liens de l’évènement : publié avec page → public ; sinon aperçu privé', () => {
  const pub = eventLinks('la-nuit', true, true);
  assert.equal(pub.live, true); assert.equal(pub.viewHref, publicPath('la-nuit')); assert.equal(pub.isPreview, false);
  assert.match(pub.publicUrl, /^https?:\/\/.+\/editions\/la-nuit$/);
  const draft = eventLinks('la-nuit', false, true);
  assert.equal(draft.live, false); assert.equal(draft.viewHref, previewPath('la-nuit')); assert.equal(draft.isPreview, true);
  assert.equal(eventLinks('x', true, false).viewHref, previewPath('x'));
});

import { computeFee, effectiveRates, feePreview } from '../../lib/ticketing/fees.ts';
import { sourceOf } from '../../lib/organizer/audience.ts';

test('frais : taux effectifs (surcharge > global), calcul, aperçu client / organisateur', () => {
  const g = { feePercent: 3, feeFixedCents: 50 };
  assert.deepEqual(effectiveRates(null, g), { percent: 3, fixedCents: 50, source: 'global' });
  assert.deepEqual(effectiveRates({ percent: null, fixed: null }, g), { percent: 3, fixedCents: 50, source: 'global' });
  assert.deepEqual(effectiveRates({ percent: 5, fixed: null }, g), { percent: 5, fixedCents: 50, source: 'event' });
  assert.deepEqual(effectiveRates({ percent: 0, fixed: 0 }, g), { percent: 0, fixedCents: 0, source: 'event' });
  assert.equal(computeFee(0, { percent: 3, fixedCents: 50 }), 0);            // gratuit : jamais de frais
  assert.equal(computeFee(1500, { percent: 3, fixedCents: 50 }), 95);        // 45 + 50
  assert.deepEqual(feePreview(1500, { percent: 3, fixedCents: 50 }, 'customer'), { customerPays: 1595, fee: 95, organizerReceives: 1500 });
  assert.deepEqual(feePreview(1500, { percent: 3, fixedCents: 50 }, 'included'), { customerPays: 1500, fee: 95, organizerReceives: 1405 });
  assert.deepEqual(feePreview(0, { percent: 3, fixedCents: 50 }, 'included'), { customerPays: 0, fee: 0, organizerReceives: 0 });
  assert.equal(feePreview(30, { percent: 0, fixedCents: 100 }, 'included').organizerReceives, 0); // jamais négatif
});

test('audience : canal d’une visite d’après le referrer', () => {
  assert.equal(sourceOf('', 'la-sunshines.vercel.app'), 'direct');
  assert.equal(sourceOf('la-sunshines.vercel.app', 'la-sunshines.vercel.app'), 'site');
  assert.equal(sourceOf('l.instagram.com', 'x.app'), 'instagram');
  assert.equal(sourceOf('www.tiktok.com', 'x.app'), 'tiktok');
  assert.equal(sourceOf('m.facebook.com', 'x.app'), 'facebook');
  assert.equal(sourceOf('www.google.fr', 'x.app'), 'google');
  assert.equal(sourceOf('wa.me', 'x.app'), 'whatsapp');
  assert.equal(sourceOf('exemple.org', 'x.app'), 'autre');
  assert.equal(sourceOf('instagram.com.evil.org', 'x.app'), 'autre');
});
