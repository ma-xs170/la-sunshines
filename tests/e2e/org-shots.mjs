// Captures de l'espace organisateur (ordinateur + mobile) sur les données de test du banc. OUT=/dossier node tests/e2e/org-shots.mjs
import { chromium } from 'playwright';
import * as L from './lib.mjs';
const OUT = process.env.OUT || '.';
const staff = await L.as(L.USERS.staff);
const cookies = Object.entries(staff.jar).map(([name, value]) => ({ name, value, url: L.BASE }));
const b = await chromium.launch();
const shots = [
  ['desktop', { width: 1280, height: 900 }, '/organisateur', 'liste'],
  ['desktop', { width: 1280, height: 900 }, '/organisateur/evenements/la-nuit-des-ombres', 'fiche'],
  ['mobile', { width: 390, height: 844 }, '/organisateur', 'liste'],
  ['mobile', { width: 390, height: 844 }, '/organisateur/evenements/la-nuit-des-ombres', 'fiche'],
];
for (const [dev, vp, url, name] of shots) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1, ...(dev === 'mobile' ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  await page.goto(L.BASE + url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${dev}-${name}.png`, fullPage: true });
  if (name === 'liste') {
    await page.getByRole('button', { name: 'Carrousel' }).click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${dev}-carrousel.png`, fullPage: false });
  }
  await ctx.close();
}
await b.close();
console.log('captures OK');
process.exit(0);
