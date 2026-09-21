// s15 — test navigateur (Playwright) : pages publiques principales + pages organisateur / admin, ordinateur et mobile.
// Contrôles : statut < 400, titre présent, aucune erreur JavaScript, aucun défilement horizontal ; menu latéral PLAT (jamais ovale) dans les espaces organisateur et admin.
import { chromium } from 'playwright';
import * as L from './lib.mjs';
const { ok, section, as, q, USERS } = L;

await L.resetDb();
const admin = await as(USERS.admin), org = await as(USERS.staff);
const O = (await q(`select id from public.organizers where is_default`))[0]?.id;
await q(`insert into public.organizer_members (organizer_id, user_id, role) values ($1, $2, 'owner') on conflict do nothing`, [O, USERS.staff.id]);
const PUBLIC = ['/', '/editions', '/editions/la-nuit-des-ombres', '/editions/before-christmas', '/artistes', '/interdits', '/infos', '/connexion', '/inscription', '/mentions-legales', '/contact'];
const ORG = ['/organisateur', '/organisateur/evenements', '/organisateur/evenements/nouveau', '/organisateur/calendrier', '/organisateur/paiements', '/organisateur/notifications', '/organisateur/support', '/devenir-organisateur'];
const ADM = ['/admin', '/admin/contenu', '/admin/contenu?onglet=artists', '/admin/gestion/organisateurs', '/admin/gestion/evenements', '/admin/gestion/publications', '/admin/gestion/support', '/admin/gestion/calendrier', '/admin/gestion/audit', '/admin/gestion/reglages', '/admin/gestion/administrateurs', '/admin/billetterie'];
const IGNORED = /googletagmanager|google-analytics|bizouk|fonts\.g|favicon|Failed to load resource|net::ERR|ERR_BLOCKED|CSP|Content Security Policy|Hydration/i;
const browser = await chromium.launch();

async function visit(ctx, path, label, expectShell) {
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !IGNORED.test(m.text())) errs.push(m.text().slice(0, 120)); });
  const r = await page.goto(L.BASE + path, { waitUntil: 'load', timeout: 60000 }).catch((e) => ({ status: () => 0, err: e.message }));
  await page.waitForTimeout(400);
  const st = r.status(); const title = await page.title().catch(() => '');
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1).catch(() => false);
  ok(st > 0 && st < 400, `${label} ${path} → ${st}`);
  ok(title.length > 0, `${label} ${path} : titre « ${title.slice(0, 40)} »`);
  ok(!wide, `${label} ${path} : pas de défilement horizontal`);
  ok(errs.length === 0, `${label} ${path} : aucune erreur JavaScript${errs.length ? ' — ' + errs.slice(0, 2).join(' | ') : ''}`);
  if (expectShell && st < 400) {
    const radius = await page.evaluate(() => { const a = document.querySelector('.oside'); return a ? getComputedStyle(a).borderTopRightRadius + '|' + getComputedStyle(a).borderBottomRightRadius : null; });
    ok(radius === '0px|0px', `${label} ${path} : menu latéral plat (rayon ${radius})`);
  }
  await page.close();
}

for (const [dev, vp, mobile] of [['ordinateur', { width: 1280, height: 900 }, false], ['mobile', { width: 390, height: 844 }, true]]) {
  section(`Pages publiques — ${dev}`);
  const pub = await browser.newContext({ viewport: vp, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await pub.addCookies([{ name: 'sun_consent', value: 'refused', url: L.BASE }]);
  for (const p of PUBLIC) await visit(pub, p, dev, false);
  await pub.close();
  section(`Espace organisateur — ${dev}`);
  const oc = await browser.newContext({ viewport: vp, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await oc.addCookies(Object.entries(org.jar).map(([name, value]) => ({ name, value, url: L.BASE })));
  for (const p of ORG) await visit(oc, p, dev, !mobile && p.startsWith('/organisateur'));
  await oc.close();
  section(`Espace admin — ${dev}`);
  const ac = await browser.newContext({ viewport: vp, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await ac.addCookies([...Object.entries(admin.jar).map(([name, value]) => ({ name, value, url: L.BASE })), { name: 'sun_admin', value: L.legacyAdminCookie().split('=')[1], url: L.BASE }]);
  for (const p of ADM) await visit(ac, p, dev, !mobile);
  await ac.close();
}
await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 5000))]);
process.exit(L.summary('pages publiques, organisateur et admin (navigateur)') ? 1 : 0);
