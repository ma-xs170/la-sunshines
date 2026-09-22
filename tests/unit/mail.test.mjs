import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readableMailError, fromAddress, FALLBACK_FROM } from '../../lib/mail.ts';

test('readableMailError : messages lisibles selon le type d’erreur Resend, jamais le détail brut', () => {
  assert.match(readableMailError({ name: 'validation_error', message: 'The domain is not verified' }), /domaine.*vérifié/i);
  assert.match(readableMailError({ name: 'invalid_api_key', message: 'API key is invalid' }), /clé.*invalide/i);
  assert.match(readableMailError({ name: 'rate_limit_exceeded', message: 'Too many requests' }), /limite/i);
  assert.match(readableMailError({ message: 'from address not verified for domain' }), /vérifiée/i);
  assert.equal(readableMailError(null), 'Envoi impossible pour le moment.');
  assert.equal(readableMailError(undefined), 'Envoi impossible pour le moment.');
  assert.match(readableMailError({ name: 'unknown_thing' }), /Resend/);
});

test('fromAddress : MAIL_FROM si réglée, sinon le domaine de test (jamais un mot de passe ni un secret)', () => {
  const before = process.env.MAIL_FROM;
  try {
    delete process.env.MAIL_FROM;
    assert.equal(fromAddress(), FALLBACK_FROM);
    process.env.MAIL_FROM = 'LA SUNSHINES <billets@la-sunshines.fr>';
    assert.equal(fromAddress(), 'LA SUNSHINES <billets@la-sunshines.fr>');
  } finally {
    if (before === undefined) delete process.env.MAIL_FROM; else process.env.MAIL_FROM = before;
  }
});
