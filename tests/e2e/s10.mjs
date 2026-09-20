// Admin billetterie (navigateur réel) : liste « Non visible du public » + lien vers l'événement, lien profond /admin?edit=,
// bandeau de visibilité, interrupteur + statut, bouton « Activer et publier pour le test », effet sur la page publique.
// SHOTS=/dossier pour enregistrer des captures.
import { chromium } from 'playwright';
import * as L from './lib.mjs';
const { ok, section, as, q, one, USERS } = L;
const SLUG = 'la-nuit-des-ombres';
const SHOTS = process.env.SHOTS;

await L.resetDb();
const admin = await as(USERS.admin);
await L.setupEvent(admin);                       // événement configuré, publié, 2 tarifs (mode « interne » du banc)
await q(`update public.ticketed_events set ticketing_enabled = false, status = 'draft' where event_slug = $1`, [SLUG]); // état de départ : brouillon désactivé
const legacy = new L.Client();
await legacy.req('/api/admin/login', { method: 'POST', body: { password: 'e2e-admin' } });
const cookies = [...Object.entries(admin.jar), ...Object.entries(legacy.jar)].map(([name, value]) => ({ name, value, url: L.BASE }));
const publicHtml = async () => (await new L.Client().req(`/editions/${SLUG}`)).data;
const hasTiers = (html) => /tp__/.test(html) && /Standard/.test(html);

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
await ctx.addCookies(cookies);
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };

try {
  section('Liste « Événements en billetterie »');
  await page.goto(L.BASE + '/admin/billetterie', { waitUntil: 'networkidle' });
  const list = await page.locator('.admin-list__item').first().innerText();
  ok(/Non visible du public/.test(list), 'un événement en brouillon désactivé affiche « Non visible du public »');
  ok(/Brouillon/.test(list) && /Billetterie désactivée/.test(list), 'raisons explicites : statut Brouillon + billetterie désactivée');
  ok(await page.getByRole('link', { name: 'Ouvrir l’évènement dans l’admin' }).count() === 1, 'lien « Ouvrir l’évènement dans l’admin »');
  ok(/edit=la-nuit-des-ombres/.test(await page.getByRole('link', { name: 'Ouvrir l’évènement dans l’admin' }).getAttribute('href')), 'le lien contient le slug');
  await shot('1-liste');

  section('Lien profond → bloc « Billetterie »');
  await page.getByRole('link', { name: 'Ouvrir l’évènement dans l’admin' }).click();
  await page.waitForURL(/\/admin\?edit=/);
  const block = page.locator('section[aria-label="Billetterie"]');
  await block.waitFor();
  await page.waitForSelector('.tb-status');
  ok(/Non visible du public/.test(await page.locator('.tb-status').innerText()), 'le bloc s’ouvre directement sur l’événement, bandeau « Non visible du public »');
  const st = await page.locator('.tb-status').innerText();
  ok(/Billetterie activée : NON/.test(st) && /Statut : Brouillon/.test(st), 'réglages visibles : « Billetterie activée : NON », « Statut : Brouillon »');
  ok(await page.getByRole('switch').count() === 1 && await page.getByRole('radio', { name: 'Brouillon' }).count() === 1 && await page.getByRole('radio', { name: 'Publié' }).count() === 1, 'interrupteur « Billetterie activée » + statut Brouillon / Publié bien visibles');
  ok(await page.getByRole('button', { name: 'Activer et publier pour le test' }).isVisible(), 'bouton unique « Activer et publier pour le test »');
  await block.scrollIntoViewIfNeeded();
  await shot('2-bloc-brouillon');
  ok(!hasTiers(await publicHtml()), 'page publique : aucun tarif tant que c’est un brouillon désactivé');

  section('Interrupteur et statut (avant enregistrement)');
  await page.getByRole('switch').click();
  await page.getByRole('radio', { name: 'Publié' }).click();
  ok(/Modifications non enregistrées/.test(await block.innerText()), 'changement signalé « non enregistré »');

  section('Activer et publier pour le test');
  await page.getByRole('button', { name: 'Remettre en brouillon' }).click();      // annule les changements en base (brouillon)
  await page.getByRole('button', { name: 'Activer et publier pour le test' }).click();
  await page.waitForFunction(() => /Configuration prête/.test(document.querySelector('.tb-status')?.textContent ?? ''));
  const ev = await one(`select status, ticketing_enabled from public.ticketed_events where event_slug = $1`, [SLUG]);
  ok(ev.status === 'published' && ev.ticketing_enabled === true, 'un seul clic : statut Publié + billetterie activée en base');
  ok(/Billetterie activée : OUI/.test(await page.locator('.tb-status').innerText()), 'bandeau : « Billetterie activée : OUI », « Configuration prête »');
  await shot('3-bloc-actif');
  let html = ''; for (let i = 0; i < 20; i++) { html = await publicHtml(); if (hasTiers(html)) break; await new Promise((r) => setTimeout(r, 1000)); }
  ok(hasTiers(html), 'page publique : les tarifs s’affichent avec le panneau de réservation');
  ok(/Choisis tes billets|Se connecter pour réserver/.test(html), 'bouton de réservation présent');

  section('Liste après activation');
  await page.goto(L.BASE + '/admin/billetterie', { waitUntil: 'networkidle' });
  const list2 = await page.locator('.admin-list__item').first().innerText();
  ok(/Visible du public/.test(list2) && !/Non visible du public/.test(list2), 'la liste indique « Visible du public »');
  await shot('4-liste-actif');

  section('Remettre en brouillon');
  await page.goto(L.BASE + `/admin?edit=${SLUG}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.tb-status');
  await page.getByRole('button', { name: 'Remettre en brouillon' }).click();
  await page.waitForFunction(() => /Non visible du public/.test(document.querySelector('.tb-status')?.textContent ?? ''));
  const ev2 = await one(`select status, ticketing_enabled from public.ticketed_events where event_slug = $1`, [SLUG]);
  ok(ev2.status === 'draft' && ev2.ticketing_enabled === false, 'retour en brouillon désactivé en base');
  html = ''; for (let i = 0; i < 20; i++) { html = await publicHtml(); if (!hasTiers(html)) break; await new Promise((r) => setTimeout(r, 1000)); }
  ok(!hasTiers(html), 'page publique : tarifs de nouveau masqués');

  section('Événement inconnu du site');
  await q(`update public.ticketed_events set event_slug = 'evenement-fantome' where event_slug = $1`, [SLUG]);
  await page.goto(L.BASE + '/admin/billetterie', { waitUntil: 'networkidle' });
  const list3 = await page.locator('.admin-list__item').first().innerText();
  ok(/Non visible du public/.test(list3) && /Aucun événement éditorial/.test(list3) && !/Ouvrir l’évènement dans l’admin/.test(list3), 'événement sans page éditoriale : message clair, pas de lien mort');
  await shot('5-liste-fantome');
} finally { await b.close(); }
process.exit(L.summary('admin billetterie : visibilité, lien profond, activation de test') ? 1 : 0);
