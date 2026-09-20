// npm run test:unit — règles pures de l'espace organisateur.
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventState, progress, STATE_LABEL } from '../../lib/organizer/status.ts';
import { containsLink } from '../../lib/organizer/message-rules.ts';

const now = Date.parse('2026-11-01T12:00:00Z');
const base = { status: 'published', ticketing_enabled: true, starts_at: '2026-11-07T00:00:00Z', capacity: 100, sold: 10, reserved: 0 };

test('statut : brouillon / en vente / complet / terminé / annulé', () => {
  assert.equal(eventState({ ...base, status: 'draft' }, now), 'draft');
  assert.equal(eventState({ ...base, ticketing_enabled: false }, now), 'draft');
  assert.equal(eventState(base, now), 'on_sale');
  assert.equal(eventState({ ...base, sold: 90, reserved: 10 }, now), 'sold_out');
  assert.equal(eventState({ ...base, sold: 100 }, now), 'sold_out');
  assert.equal(eventState({ ...base, starts_at: '2026-10-01T00:00:00Z' }, now), 'ended');
  assert.equal(eventState({ ...base, status: 'closed' }, now), 'ended');
  assert.equal(eventState({ ...base, status: 'cancelled' }, now), 'cancelled');
  assert.equal(STATE_LABEL.sold_out, 'Complet');
});
test('un événement reste « à venir » jusqu\'à 12 h après son début', () => {
  const start = '2026-11-01T06:00:00Z';
  assert.equal(eventState({ ...base, starts_at: start }, Date.parse('2026-11-01T17:59:00Z')), 'on_sale');
  assert.equal(eventState({ ...base, starts_at: start }, Date.parse('2026-11-01T18:01:00Z')), 'ended');
});
test('progression : vendus + réservations en cours, jamais au-delà de 100 %', () => {
  assert.deepEqual(progress(38, 5, 100), { soldPct: 38, reservedPct: 5, totalPct: 38 });
  assert.equal(progress(0, 0, 0).totalPct, 0);
  const full = progress(100, 20, 100);
  assert.equal(full.soldPct + full.reservedPct, 100);
  const over = progress(80, 50, 100);
  assert.equal(over.soldPct + over.reservedPct, 100);
  assert.equal(progress(150, 0, 100).soldPct, 100);
});
test('message d\'information : aucun lien accepté', () => {
  for (const t of ['https://boutique.example/promo', 'http://x.io', 'www.promo.fr', 'va sur promo.shop', 'bit.ly/abc', 'lien.com']) assert.equal(containsLink(t), true, t);
  for (const t of ['Les portes ouvrent à 19 h.', 'Pense à ta pièce d\'identité (12–17 ans).', 'Parking : rue du Test, Pointe-à-Pitre.', 'Prévois 5,50 € en espèces ? Non : paiement en ligne.']) assert.equal(containsLink(t), false, t);
  assert.equal(containsLink('ok', 'mais www.piege.fr'), true);
});
