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
