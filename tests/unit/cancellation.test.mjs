import test from 'node:test';
import assert from 'node:assert/strict';
import { REASON_OPTIONS, REASON_LABEL, isReasonCode, fillTemplate, buildDefaultMessage, step1Errors, step3Errors } from '../../lib/organizer/cancellation.ts';

const ev = { title: 'La Nuit des Ombres', starts_at: '2026-12-05T22:00:00-04:00', venue: 'Salle X', organizer_name: 'THE MOUV' };

test('raisons : 4 options, libellés attendus, garde de type', () => {
  assert.deepEqual(REASON_OPTIONS.map((o) => o.value), ['weather', 'permit', 'low_sales', 'other']);
  assert.equal(REASON_LABEL.weather, 'Météo');
  assert.equal(REASON_LABEL.permit, 'Autorisation refusée ou retirée');
  assert.equal(REASON_LABEL.low_sales, 'Vente insuffisante');
  assert.equal(REASON_LABEL.other, 'Autre');
  assert.ok(isReasonCode('weather'));
  assert.ok(!isReasonCode('flemme'));
});

test('fillTemplate : remplace les 4 variables, garde le lieu par défaut si vide', () => {
  const out = fillTemplate('« {evenement} » le {date} à {lieu}, par {organisateur}.', ev);
  assert.ok(out.includes('La Nuit des Ombres') && out.includes('THE MOUV') && out.includes('Salle X'));
  assert.ok(!out.includes('{'));
  const noVenue = fillTemplate('{lieu}', { ...ev, venue: '' });
  assert.equal(noVenue, 'à confirmer');
});

test('buildDefaultMessage : sans remplacement, message inchangé', () => {
  const tpl = { subject: 'Annulation de {evenement}', body: 'Désolés pour {evenement}.', source: 'default' };
  const m = buildDefaultMessage(tpl, ev, null);
  assert.equal(m.subject, 'Annulation de La Nuit des Ombres');
  assert.equal(m.body, 'Désolés pour La Nuit des Ombres.');
});

test('buildDefaultMessage : en mode remplacement, un paragraphe mentionnant le nouvel évènement est ajouté', () => {
  const tpl = { subject: 'Annulation de {evenement}', body: 'Désolés pour {evenement}.', source: 'default' };
  const rep = { slug: 'la-nuit-2', title: 'La Nuit des Ombres — Reprise', starts_at: '2027-01-10T22:00:00-04:00', venue: 'Salle Y' };
  const m = buildDefaultMessage(tpl, ev, rep);
  assert.ok(m.body.includes('La Nuit des Ombres — Reprise'));
  assert.ok(m.body.includes('Salle Y'));
  assert.ok(m.body.startsWith('Désolés pour La Nuit des Ombres.'));
});

test('step1Errors : mode obligatoire, remplacement obligatoire si mode = replace', () => {
  assert.deepEqual(Object.keys(step1Errors('', '', true)), ['mode']);
  assert.deepEqual(Object.keys(step1Errors('cancel', '', true)), []);
  assert.deepEqual(Object.keys(step1Errors('replace', '', true)), ['replacement']);
  assert.deepEqual(Object.keys(step1Errors('replace', 'x', false)), ['replacement']);
  assert.deepEqual(Object.keys(step1Errors('replace', 'x', true)), []);
});

test('step3Errors : raison, détail si « Autre », objet et message obligatoires', () => {
  assert.deepEqual(Object.keys(step3Errors('', '', '', '')).sort(), ['body', 'reason', 'subject']);
  assert.deepEqual(Object.keys(step3Errors('weather', '', 's', 'b')), []);
  assert.deepEqual(Object.keys(step3Errors('other', 'abc', 's', 'b')), ['detail']);
  assert.deepEqual(Object.keys(step3Errors('other', 'raison suffisante', 's', 'b')), []);
  assert.deepEqual(Object.keys(step3Errors('weather', '', 's', 'x'.repeat(2001))), ['body']);
});
