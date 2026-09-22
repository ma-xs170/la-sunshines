import test from 'node:test';
import assert from 'node:assert/strict';
import { pageWindow, pageCount, rangeLabel } from '../../lib/admin/clients/pagination.ts';
import { normalizePhone, formatPhone, phoneKey, samePhone } from '../../lib/admin/clients/phone.ts';
import { parseClientsQuery, clientsHref, nextSort, DEFAULT_QUERY } from '../../lib/admin/clients/query.ts';

const w = (c, t, r) => pageWindow(c, t, r).join(' ');

test('pagination : 0, 1, 2 et 5 pages', () => {
  assert.equal(w(1, 0), '');
  assert.equal(w(1, 1), '1');
  assert.equal(w(1, 2), '1 2');
  assert.equal(w(2, 2), '1 2');
  assert.equal(w(3, 5), '1 2 3 4 5');
});
test('pagination : 6 pages (pas de « … » quand rien n’est sauté)', () => {
  assert.equal(w(1, 6), '1 2 3 4 5 6');
  assert.equal(w(4, 6), '1 2 3 4 5 6');
  assert.equal(w(6, 6), '1 2 3 4 5 6');
});
test('pagination : 67 pages, début (pages 1 à 4)', () => {
  assert.equal(w(1, 67), '1 2 3 4 5 … 67');
  assert.equal(w(2, 67), '1 2 3 4 5 … 67');
  assert.equal(w(3, 67), '1 2 3 4 5 … 67');
  assert.equal(w(4, 67), '1 2 3 4 5 6 … 67');
});
test('pagination : 67 pages, page 5 → fenêtre 3 à 7 avec 1re et dernière', () => {
  assert.equal(w(5, 67), '1 … 3 4 5 6 7 … 67');
  assert.equal(w(6, 67), '1 … 4 5 6 7 8 … 67');
});
test('pagination : milieu, avant-dernière, dernière', () => {
  assert.equal(w(34, 67), '1 … 32 33 34 35 36 … 67');
  assert.equal(w(64, 67), '1 … 62 63 64 65 66 67');
  assert.equal(w(65, 67), '1 … 63 64 65 66 67');
  assert.equal(w(66, 67), '1 … 63 64 65 66 67');
  assert.equal(w(67, 67), '1 … 63 64 65 66 67');
});
test('pagination : la page active est toujours présente, jamais de doublon, valeurs hors bornes ramenées', () => {
  for (const total of [1, 2, 3, 5, 6, 7, 8, 20, 67, 1000]) for (let c = 1; c <= total; c++) {
    const l = pageWindow(c, total); const nums = l.filter((x) => x !== '…');
    assert.ok(nums.includes(c), `page ${c}/${total}`); assert.equal(new Set(nums).size, nums.length); assert.equal(nums[0], 1); assert.equal(nums.at(-1), total);
    assert.deepEqual([...nums].sort((a, b) => a - b), nums);
    l.forEach((x, i) => { if (x === '…') assert.ok(typeof l[i - 1] === 'number' && typeof l[i + 1] === 'number' && l[i + 1] - l[i - 1] >= 2); });
  }
  assert.equal(w(999, 10), w(10, 10)); assert.equal(w(-4, 10), w(1, 10)); assert.equal(w(Number.NaN, 10), w(1, 10));
});
test('pagination : version mobile (rayon 1)', () => { assert.equal(w(34, 67, 1), '1 … 33 34 35 … 67'); assert.equal(w(1, 67, 1), '1 2 3 … 67'); });
test('pageCount et libellé « 1–20 sur 1 342 clients »', () => {
  assert.equal(pageCount(0, 20), 0); assert.equal(pageCount(20, 20), 1); assert.equal(pageCount(21, 20), 2); assert.equal(pageCount(1342, 20), 68);
  assert.equal(rangeLabel(1, 20, 1342), '1–20 sur 1 342 clients');
  assert.equal(rangeLabel(68, 20, 1342), '1 341–1 342 sur 1 342 clients');
  assert.equal(rangeLabel(1, 20, 1), '1–1 sur 1 client'); assert.equal(rangeLabel(1, 20, 0), '0 clients');
});

test('téléphone : formats acceptés', () => {
  for (const [raw, v] of [['', ''], ['0690123456', '0690123456'], ['06 90 12 34 56', '0690123456'], ['06.90.12.34.56', '0690123456'], ['+590 690 12 34 56', '+590690123456'], ['00590690123456', '+590690123456'],
    ['+596 696 12 34 56', '+596696123456'], ['+33 6 12 34 56 78', '+33612345678'], ['+1 721 554 1234', '+17215541234'], ['+594 694 00 11 22', '+594694001122'], ['(0690) 12-34-56', '0690123456']]) {
    const r = normalizePhone(raw); assert.deepEqual(r, { ok: true, value: v }, raw);
  }
});
test('téléphone : formats refusés', () => {
  for (const raw of ['abc', '0690', '12345', '+0690123456', '+59', '069012345678', '590690123456', '+590+690123456', '06 90 12 34 5a', '+', '00', '+1234567890123456']) assert.equal(normalizePhone(raw).ok, false, raw);
});
test('téléphone : affichage et équivalence 0690… / +590 690…', () => {
  assert.equal(formatPhone('0690123456'), '06 90 12 34 56'); assert.equal(formatPhone('+590690123456'), '+590 690 12 34 56'); assert.equal(formatPhone('+33612345678'), '+33 6 12 34 56 78');
  assert.equal(formatPhone('+17215541234'), '+1 721 554 1234'); assert.equal(formatPhone('n’importe quoi'), 'n’importe quoi'); assert.equal(formatPhone(''), '');
  assert.ok(samePhone('0690123456', '+590 690 12 34 56')); assert.ok(samePhone('00590690123456', '0690 12 34 56')); assert.ok(!samePhone('0690123456', '0691123456')); assert.ok(!samePhone('', ''));
  assert.equal(phoneKey('06901'), '6901'); assert.equal(phoneKey('+590 690 12 34 56'), '690123456');
});

test('URL des filtres : valeurs par défaut omises, entrées invalides ignorées', () => {
  assert.deepEqual(parseClientsQuery({}), DEFAULT_QUERY);
  assert.equal(clientsHref(DEFAULT_QUERY), '/admin/clients');
  const q = parseClientsQuery({ q: '  Élodie   Dupont ', role: 'organizers', statut: 'suspended', avenir: '1', mineurs: '1', tri: 'nom', page: '3' });
  assert.deepEqual(q, { q: 'Élodie Dupont', role: 'organizers', status: 'suspended', upcoming: true, minors: true, sort: 'nom', dir: 'asc', page: 3 });
  assert.equal(clientsHref(q), '/admin/clients?q=%C3%89lodie+Dupont&role=organizers&statut=suspended&avenir=1&mineurs=1&tri=nom&sens=asc&page=3');
  assert.deepEqual(parseClientsQuery(new URLSearchParams(clientsHref(q).split('?')[1])), q);
  const bad = parseClientsQuery({ q: 'a', role: 'root', statut: 'x', tri: 'email; drop', sens: 'up', page: '-4' });
  assert.deepEqual(bad, DEFAULT_QUERY);
  assert.equal(parseClientsQuery({ page: 'abc' }).page, 1); assert.equal(parseClientsQuery({ q: 'x'.repeat(200) }).q.length, 80);
});
test('tri : retour page 1, sens inversé sur la même colonne', () => {
  let c = { ...DEFAULT_QUERY, page: 4 };
  c = nextSort(c, 'nom'); assert.deepEqual([c.sort, c.dir, c.page], ['nom', 'asc', 1]);
  c = nextSort(c, 'nom'); assert.deepEqual([c.sort, c.dir], ['nom', 'desc']);
  c = nextSort(c, 'inscription'); assert.deepEqual([c.sort, c.dir], ['inscription', 'desc']);
  c = nextSort(c, 'age'); assert.deepEqual([c.sort, c.dir], ['age', 'asc']);
});

import { safeCell, customersCsv, BOM, CSV_HEADER } from '../../lib/admin/clients/csv.ts';
import { ageFrom, ageOutOfRange, fullName, fmtBirth, orderStatusLabel, NOT_SET } from '../../lib/admin/clients/format.ts';

test('CSV : protection contre l’injection de formules et échappement', () => {
  for (const [v, out] of [['=SOMME(A1)', "'=SOMME(A1)"], ['+590690123456', "'+590690123456"], ['-2+3', "'-2+3"], ['@cmd', "'@cmd"], ['\tTab', "'\tTab"], ['Jean', 'Jean'], ['', ''], [null, ''], [undefined, ''], [42, '42']]) {
    const got = safeCell(v); assert.equal(got.replace(/^"|"$/g, '').replace(/""/g, '"'), out, String(v));
  }
  assert.equal(safeCell('a;b'), '"a;b"'); assert.equal(safeCell('dit "oui"'), '"dit ""oui"""'); assert.equal(safeCell('l1\nl2'), '"l1\nl2"'); assert.equal(safeCell('=1;2'), '"\'=1;2"');
});
test('CSV : BOM UTF-8, en-tête, NOM en majuscules, lignes CRLF', () => {
  const csv = customersCsv([{ reference: 'CLI.ABC', first_name: 'Élodie', last_name: 'Dupont', email: '=HYPERLINK("x")@a.fr', phone: '+590690123456', phone2: '', birth_date: '1990-05-04', role: 'customer', status: 'active', created_at: '2026-09-01T10:00:00+00:00' }]);
  assert.ok(csv.startsWith(BOM)); const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[0], CSV_HEADER.join(';'));
  assert.ok(lines[1].startsWith("CLI.ABC;Élodie;DUPONT;\"'=HYPERLINK(\"\"x\"\")@a.fr\";'+590690123456;;1990-05-04;Client;Actif;2026-09-01"), lines[1]);
  assert.equal(lines[2], '');
  assert.equal(customersCsv([]).slice(1).split('\r\n').length, 2);
});
test('format : âge, mineur, hors 12–100, libellés', () => {
  const now = new Date('2026-09-21T12:00:00Z');
  assert.equal(ageFrom('1990-05-04', now), 36); assert.equal(ageFrom('2012-09-21', now), 14); assert.equal(ageFrom('2012-09-22', now), 13); assert.equal(ageFrom('2026-09-22', now), null);
  assert.equal(ageFrom('', now), null); assert.equal(ageFrom('n’importe quoi', now), null);
  assert.ok(ageOutOfRange(11) && ageOutOfRange(101) && !ageOutOfRange(12) && !ageOutOfRange(100) && !ageOutOfRange(null));
  assert.equal(fullName('Élodie', 'Dupont'), 'DUPONT Élodie'); assert.equal(fullName('', ''), NOT_SET); assert.equal(fmtBirth('1990-05-04'), '04/05/1990'); assert.equal(fmtBirth(null), NOT_SET);
  assert.equal(orderStatusLabel('paid', 1500), 'Payé'); assert.equal(orderStatusLabel('paid', 0), 'Gratuit'); assert.equal(orderStatusLabel('refunded', 1500), 'Remboursé'); assert.equal(orderStatusLabel('cancelled', 0), 'Annulé');
});
