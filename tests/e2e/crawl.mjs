// Parcours du back-office : ouvre chaque lien du menu (organisateur : contexte compte + contexte évènement ; admin : menu plat)
// sur ordinateur ET mobile et contrôle : statut HTTP, page non vide, aucune erreur console, aucun défilement horizontal,
// aucune bande noire (pied de page du site public), aucun « Bientôt ». À lancer après s9 (données du banc).
// AS=staff|admin  SLUG=la-nuit-des-ombres  OUT=/dossier  SHOTS=1 (captures)  node tests/e2e/crawl.mjs
import { chromium } from 'playwright';
import * as L from './lib.mjs';
const AS = process.env.AS || 'staff', SLUG = process.env.SLUG || 'la-nuit-des-ombres', OUT = process.env.OUT, SHOTS = process.env.SHOTS === '1';
const who = await L.as(L.USERS[AS]);
const cookies = Object.entries(who.jar).map(([name, value]) => ({ name, value, url: L.BASE }));
const b = await chromium.launch();
let bad = 0;
const fail = (m) => { bad++; console.log('FAIL', m); };
const roots = AS === 'admin' ? ['/admin'] : ['/organisateur', `/organisateur/evenements/${SLUG}`];
const seen = new Set(process.env.EXTRA ? process.env.EXTRA.split(',') : []);
for (const [dev, vp] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  const ctx = await b.newContext({ viewport: vp, ...(dev === 'mobile' ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource.*(fonts|_vercel|analytics)/i.test(m.text())) errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
  const links = new Set(seen);
  for (const r of roots) {
    await page.goto(L.BASE + r, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    // ouvre toutes les sections du menu pour lire leurs liens
    if (dev === 'mobile') { await page.getByRole('button', { name: 'Ouvrir le menu' }).click().catch(() => {}); }
    // une seule section ouverte à la fois : on ouvre chaque rubrique tour à tour et on relève ses liens
    const heads = page.locator('.oside__head[aria-expanded]');
    const collect = async () => { for (const h of await page.locator('.oside a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href')))) if (h && h.startsWith('/')) links.add(h); };
    await collect();
    for (let i = 0; i < await heads.count(); i++) { await heads.nth(i).click().catch(() => {}); await collect(); if (await page.locator('.oside__soon').count()) { fail(`${dev} ${r} : « Bientôt » dans le menu`); break; } }
  }
  for (const href of [...links]) {
    const errStart = errors.length;
    let res; try { res = await page.goto(L.BASE + href, { waitUntil: 'load', timeout: 45000 }); } catch (e) { fail(`${dev} ${href} : ${e.message.slice(0, 80)}`); continue; }
    await page.waitForTimeout(600);
    const status = res?.status() ?? 0;
    const info = await page.evaluate(() => ({
      text: (document.querySelector('#org-main')?.innerText ?? document.body.innerText).trim().length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      pubFooter: !!document.querySelector('footer#contact, footer:not(.ofoot)'),
      soon: /bientôt/i.test(document.body.innerText),
      h1: document.querySelector('h1')?.textContent?.trim() ?? '',
      notFound: /page introuvable/i.test(document.body.innerText),
    }));
    const dl = /\/export|\/api\//.test(href);
    if (!dl) {
      if (status >= 400 || info.notFound) fail(`${dev} ${href} : HTTP ${status}${info.notFound ? ' (page introuvable)' : ''}`);
      if (info.text < 40) fail(`${dev} ${href} : page vide`);
      if (info.overflow > 1) fail(`${dev} ${href} : défilement horizontal (${info.overflow}px)`);
      if (info.pubFooter) fail(`${dev} ${href} : pied de page du site public (bande noire)`);
      if (info.soon) fail(`${dev} ${href} : texte « Bientôt »`);
      if (errors.length > errStart) fail(`${dev} ${href} : console ${errors.slice(errStart).join(' | ')}`);
    }
    if (SHOTS && OUT) await page.screenshot({ path: `${OUT}/${AS}-${dev}-${href.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').slice(0, 80) || 'accueil'}.png`, fullPage: true });
    if (dev === 'desktop') seen.add(href);
  }
  await ctx.close();
  console.log(`${dev} : ${links.size} pages`);
}
await b.close();
console.log(bad ? `ÉCHEC : ${bad} problème(s)` : 'ALL OK — parcours du menu propre');
process.exit(bad ? 1 : 0);
