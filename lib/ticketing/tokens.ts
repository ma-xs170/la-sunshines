// Codes de billets : token SIGNÉ (HMAC-SHA256), jamais un identifiant séquentiel.
//
//   code = 16 car. aléatoires (80 bits) + 16 car. de signature (80 bits, HMAC du
//          payload avec TICKET_HMAC_SECRET), alphabet Crockford base32 (sans I L O U).
//
// La signature est vérifiée AVANT toute requête en base : un code falsifié ou
// deviné est rejeté sans toucher la DB. Le secret n'est jamais stocké en base.
// ⚠ Changer TICKET_HMAC_SECRET invalide tous les billets déjà émis.

import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{32}$/;

function secret(): string {
  const s = process.env.TICKET_HMAC_SECRET;
  if (!s || s.length < 32) {
    throw new Error('TICKET_HMAC_SECRET manquant ou trop court (32 caractères minimum).');
  }
  return s;
}

/** 10 octets → 16 caractères base32 (5 bits chacun, exact). */
function encode(bytes: Uint8Array): string {
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}

function sign(payload: string): string {
  return encode(createHmac('sha256', secret()).update(payload).digest().subarray(0, 10));
}

/** Nouveau code de billet (32 caractères, signé). */
export function newTicketCode(): string {
  const payload = encode(randomBytes(10));
  return payload + sign(payload);
}

/** Normalise une saisie : majuscules, sans espaces/tirets, O→0, I/L→1. Null si forme invalide. */
export function normalizeCode(input: string): string | null {
  const c = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  return CODE_RE.test(c) ? c : null;
}

/** Code normalisé si la signature est authentique, sinon null (sans accès base). */
export function verifyTicketCode(input: string): string | null {
  const code = normalizeCode(input);
  if (!code) return null;
  const expected = Buffer.from(sign(code.slice(0, 16)));
  const given = Buffer.from(code.slice(16));
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return code;
}

/** « XXXX-XXXX-… » pour l'affichage et la saisie manuelle. */
export function formatCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}
