// Captures de l'espace organisateur (ordinateur + mobile) sur les données de test du banc. OUT=/dossier node tests/e2e/org-shots.mjs
// À lancer après s9 (qui crée les organisations, événements, billets). Utilisateur : le propriétaire de THE MOUV.
import { chromium } from 'playwright';
import * as L from './lib.mjs';
const OUT = process.env.OUT || '.';
const as = process.env.AS || 'staff';
const who = await L.as(L.USERS[as]);
const cookies = Object.entries(who.jar).map(([name, value]) => ({ name, value, url: L.BASE }));
const b = await chromium.launch();
const pages = (process.env.PAGES || '/organisateur').split(',');
for (const [dev, vp] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1, ...(dev === 'mobile' ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  for (const url of pages) {
    const name = url.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'accueil';
    await page.goto(L.BASE + url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${as}-${dev}-${name}.png`, fullPage: true });
    if (url === '/organisateur') {
      await page.getByRole('button', { name: 'Vue liste' }).click(); await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/${as}-${dev}-${name}-liste.png`, fullPage: true });
      if (dev === 'mobile') {
        await page.getByRole('button', { name: 'Vue carrousel' }).click(); await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/${as}-${dev}-${name}-carrousel.png`, fullPage: false });
        await page.getByRole('button', { name: 'Ouvrir le menu' }).click(); await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/${as}-${dev}-${name}-burger.png`, fullPage: false });
      } else {
        await page.getByRole('button', { name: 'Vue grille' }).click();
        await page.getByRole('button', { name: /^Filtres/ }).click(); await page.waitForTimeout(300);
        await page.locator('.obar__orgbtn').click(); await page.waitForTimeout(300);
        await page.screenshot({ path: `${OUT}/${as}-${dev}-${name}-menus.png`, fullPage: false });
      }
    }
  }
  await ctx.close();
}
await b.close();
console.log('captures OK');
process.exit(0);
