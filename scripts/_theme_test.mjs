import { chromium } from 'playwright';
const base = 'http://localhost:3000';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });

// ===== 1. Theming par édition : couleur distincte + emojis visibles =====
console.log('=== THEMING par page événement ===');
const slugs = [
  'welcome-to-dominica',
  'la-xploz-tropical-island',
  'edition-picasso',
  'before-christmas',
  'la-nuit-des-ombres',
  'candy-land',
];
for (const slug of slugs) {
  await p.goto(`${base}/editions/${slug}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  const t = await p.evaluate(() => {
    const atmos = document.querySelector('.event-atmos');
    const wash = document.querySelector('.event-atmos__wash');
    const blobA = document.querySelector('.event-atmos__blob--a');
    const emojis = [...document.querySelectorAll('.event-emoji-field__item')];
    const cs = atmos ? getComputedStyle(atmos) : null;
    return {
      ea0: cs ? cs.getPropertyValue('--ea-0').trim() : '(none)',
      washBg: wash ? getComputedStyle(wash).backgroundImage.slice(0, 60) : '(none)',
      blobBg: blobA ? getComputedStyle(blobA).backgroundColor : '(none)',
      blobOpacity: blobA ? getComputedStyle(blobA).opacity : '(none)',
      emojiCount: emojis.length,
      emojiOpacity: emojis[0] ? getComputedStyle(emojis[0]).opacity : '(none)',
      emojiChar: emojis[0] ? emojis[0].textContent : '',
      emojiBlur: emojis[0] ? getComputedStyle(emojis[0]).filter : '',
    };
  });
  console.log(
    `${slug.padEnd(26)} --ea-0=${t.ea0.padEnd(9)} blob=${t.blobBg} @${t.blobOpacity} | emojis: ${t.emojiCount}× "${t.emojiChar}" op=${t.emojiOpacity} ${t.emojiBlur} | wash=${t.washBg.startsWith('radial') || t.washBg.startsWith('linear') ? 'OK' : t.washBg}`,
  );
}
// distinct ?
const eas = [];
for (const slug of slugs) {
  await p.goto(`${base}/editions/${slug}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  eas.push(
    await p.evaluate(() =>
      getComputedStyle(document.querySelector('.event-atmos')).getPropertyValue('--ea-0').trim(),
    ),
  );
}
console.log('\n--ea-0 par édition :', eas.join(', '));
console.log('toutes distinctes ?', new Set(eas).size === eas.length);

// ===== 2. Filtres /editions : combinaison vide -> état vide propre =====
console.log('\n=== FILTRES /editions — combinaison sans résultat ===');
await p.goto(`${base}/editions`, { waitUntil: 'networkidle' });
await p.waitForTimeout(1800);
const beforeVisible = await p.evaluate(
  () => [...document.querySelectorAll('.ed-card:not(.is-hidden)')].length,
);
console.log('cartes visibles au départ :', beforeVisible);
// clic "À venir"
await p.locator('.filters button', { hasText: 'À venir' }).click();
await p.waitForTimeout(300);
// clic "2025"
const y2025 = p.locator('.filters--years button', { hasText: '2025' });
if (await y2025.count()) await y2025.click();
await p.waitForTimeout(400);
const after = await p.evaluate(() => {
  const visible = [...document.querySelectorAll('.ed-card:not(.is-hidden)')].filter(
    (c) => getComputedStyle(c).display !== 'none',
  ).length;
  const empty = document.querySelector('.editions-empty');
  return {
    visibleCards: visible,
    hasEmptyState: !!empty,
    emptyText: empty ? empty.querySelector('p')?.textContent : null,
    hasResetBtn: !!empty?.querySelector('button'),
    emptyVisible: empty ? getComputedStyle(empty).display !== 'none' && parseFloat(getComputedStyle(empty).opacity) > 0.5 : false,
  };
});
console.log('après "À venir" + "2025" :', JSON.stringify(after));
// reset
if (after.hasResetBtn) {
  await p.locator('.editions-empty button').click();
  await p.waitForTimeout(400);
  const restored = await p.evaluate(
    () => [...document.querySelectorAll('.ed-card')].filter((c) => getComputedStyle(c).display !== 'none' && parseFloat(getComputedStyle(c).opacity) > 0.5).length,
  );
  console.log('après "Réinitialiser" : cartes visibles =', restored);
}

await p.screenshot({ path: 'scripts/_shot_empty_filters.png' });
await b.close();
