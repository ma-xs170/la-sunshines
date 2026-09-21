import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBizoukCode, bizoukSrc } from '../../lib/bizoukEmbed.ts';

const REAL = '<iframe style="background-color: transparent;" src="https://www.bizouk.com/stores/reservation/place?event=111794&widget=1" name="payment-frame" width="100%" height="1065" frameborder="0" scrolling="yes"></iframe>\n<script type="text/javascript" src="https://static.bizouk.com/lib/js/widget/widget_client.js"></script>';

test('code Bizouk légitime : seul l’identifiant est extrait', () => {
  const r = parseBizoukCode(REAL);
  assert.equal(r.ok, true);
  assert.equal(r.eventId, '111794');
  assert.equal(r.src, bizoukSrc('111794'));
  assert.ok(!r.src.includes('style'));
});
test('une simple URL Bizouk est acceptée', () => assert.equal(parseBizoukCode('https://www.bizouk.com/stores/reservation/place?event=42&widget=1').ok, true));
const REFUSED = [
  ['script en ligne', '<script>alert(1)</script><iframe src="https://www.bizouk.com/stores/reservation/place?event=1"></iframe>'],
  ['gestionnaire onload', '<iframe onload="steal()" src="https://www.bizouk.com/stores/reservation/place?event=1"></iframe>'],
  ['javascript:', '<a href="javascript:alert(1)">https://www.bizouk.com/stores/reservation/place?event=1</a>'],
  ['autre domaine', '<iframe src="https://evil.com/stores/reservation/place?event=1"></iframe>'],
  ['domaine piégé', '<iframe src="https://bizouk.com.evil.com/stores/reservation/place?event=1"></iframe>'],
  ['sous-domaine caché', '<iframe src="https://evil.com/bizouk.com/stores/reservation/place?event=1"></iframe>'],
  ['identifiant d’un autre site mêlé', '<iframe src="https://www.bizouk.com/stores/reservation/place?event=1"></iframe><iframe src="https://evil.com/x"></iframe>'],
  ['script externe non Bizouk', '<iframe src="https://www.bizouk.com/stores/reservation/place?event=1"></iframe><script src="https://evil.com/a.js"></script>'],
  ['identifiant non numérique', '<iframe src="https://www.bizouk.com/stores/reservation/place?event=1abc"></iframe>'],
  ['http non sécurisé', '<iframe src="http://www.bizouk.com/stores/reservation/place?event=1"></iframe>'],
  ['identifiants dans l’URL', '<iframe src="https://user:pw@www.bizouk.com/stores/reservation/place?event=1"></iframe>'],
  ['srcdoc', '<iframe srcdoc="<script>1</script>" src="https://www.bizouk.com/stores/reservation/place?event=1"></iframe>'],
  ['image', '<img src="https://www.bizouk.com/stores/reservation/place?event=1">'],
  ['texte quelconque', 'bonjour'],
  ['vide', ''],
];
for (const [name, code] of REFUSED) test(`code refusé : ${name}`, () => { const r = parseBizoukCode(code); assert.equal(r.ok, false, name); assert.ok(r.message.length > 10); });
