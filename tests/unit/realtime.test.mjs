// npm run test:unit — garde-fous « temps réel » : aucune écriture ne doit laisser le site public sur un cache de 60 s.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('toute écriture du store invalide le site public tout de suite', () => {
  assert.match(read('lib/persistStore.ts'), /revalidatePublicSite\(\)/);
  assert.match(read('lib/ticketing/guard.ts'), /revalidatePublicSite\(\)/);
  assert.match(read('lib/revalidate.ts'), /revalidatePath\('\/', 'layout'\)/);
});

test('la disponibilité publique est mise en cache 1 s au plus', () => {
  const h = read('app/api/billetterie/[slug]/disponibilite/route.ts');
  const m = /s-maxage=(\d+)/.exec(h);
  assert.ok(m && Number(m[1]) <= 1, 'CDN : 1 s maximum');
});

test('le stock affiché est interrogé toutes les 2 s, en pause quand l’onglet est masqué', () => {
  const t = read('components/ticketing/TicketPanel.tsx');
  assert.match(t, /setInterval\(refresh, 2000\)/);
  assert.match(t, /visibilityState/);
});

test('aucune donnée d’organisateur ou de billetterie ne repose sur un intervalle de 60 s côté interface', () => {
  for (const f of ['components/ticketing/TicketPanel.tsx', 'components/organizer/ParticipantsSection.tsx', 'components/organizer/TiersPanel.tsx']) {
    assert.doesNotMatch(read(f), /setInterval\([^)]*(60_?000)/, f);
  }
});
