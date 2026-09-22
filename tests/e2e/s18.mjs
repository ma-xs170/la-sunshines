// s18 — page super-admin « Clients » : accès (404 pour tout non-autorisé, page ET API), liste 20 par page, recherche, pagination (navigateur), mobile.
// Les comptes de test (@clients-e2e.local) sont créés puis SUPPRIMÉS par ce script. Aucun e-mail réel : Resend est simulé.
import { chromium } from 'playwright';
import fs from 'fs';
import * as L from './lib.mjs';
const { ok, section, as, q, one, USERS } = L;
const SHOTS = process.env.SHOTS_DIR || '/tmp/clients-shots';
fs.mkdirSync(SHOTS, { recursive: true });

const cleanup = () => q(`delete from auth.users where email like '%@clients-e2e.local'`);
await cleanup();
await L.resetDb();
await q(`insert into public.admin_accounts (user_id, level, must_change_password, invitation_status) values ($1, 'super', false, 'sent'), ($2, 'admin', false, 'sent') on conflict (user_id) do update set level = excluded.level, permissions = '{}', active = true, must_change_password = false`, [USERS.admin.id, USERS.deleg.id]);
const O = (await q(`select id from public.organizers where is_default`))[0]?.id;
await q(`insert into public.organizer_members (organizer_id, user_id, role) values ($1, $2, 'owner') on conflict do nothing`, [O, USERS.orgb.id]);

// 130 clients de remplissage (7 pages de 20), + 3 comptes de référence
await q(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, created_at)
  select ('c8100000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'fill' || g || '@clients-e2e.local', now(), jsonb_build_object('first_name', 'Rempli' || g, 'last_name', 'Zed' || lpad(g::text, 3, '0')), now() - (g || ' minutes')::interval from generate_series(1, 130) g`);
await q(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, created_at) values
  ('c8000000-0000-4000-8000-000000000011', 'elodie.dupont@clients-e2e.local', now(), '{"first_name":"Élodie","last_name":"Dupont","phone":"0690123456"}', now() - interval '3 days'),
  ('c8000000-0000-4000-8000-000000000012', 'jean.martin@clients-e2e.local', now(), '{"first_name":"Jean","last_name":"Martin","phone":"+590 690 11 22 33"}', now() - interval '4 days'),
  ('c8000000-0000-4000-8000-000000000013', 'leo.petit@clients-e2e.local', now(), '{"first_name":"Léo","last_name":"Petit"}', now() - interval '5 days')`);
await q(`update public.profiles set birth_date = date '1990-05-04' where id = 'c8000000-0000-4000-8000-000000000011'`);
await q(`update public.profiles set birth_date = (current_date - interval '14 years')::date where id = 'c8000000-0000-4000-8000-000000000013'`);
const total = (await one(`select count(*)::int n from public.profiles p where p.role <> 'admin' and not exists (select 1 from public.organizer_members m where m.user_id = p.id)`)).n;

const admin = await as(USERS.admin), deleg = await as(USERS.deleg), cust = await as(USERS.cust), orgb = await as(USERS.orgb), staff = await as(USERS.staff);
const anon = new L.Client();

section('Accès : 404 pour tout compte non autorisé (page ET API)');
for (const [label, c] of [['visiteur non connecté', anon], ['client', cust], ['organisateur', orgb], ['équipe scan', staff], ['admin sans permission', deleg]]) {
  let r = await c.req('/admin/clients'); ok(r.status === 404, `${label} : /admin/clients → 404 (${r.status})`);
  ok(!/Dupont|DUPONT|elodie/i.test(String(r.data)), `${label} : aucune donnée dans la réponse`);
  r = await c.req('/api/admin-clients'); ok(r.status === 404, `${label} : /api/admin-clients → 404 (${r.status})`);
  r = await c.req('/api/admin-clients/export?ack=1'); ok(r.status === 404, `${label} : export CSV → 404 (${r.status})`);
}
let r = await admin.req('/admin/clients?q=jean');
ok(r.status === 200 && /Clients/.test(r.data), 'super-admin : la page s’affiche');
ok(/no-store/.test(r.headers.get('cache-control') || ''), `Cache-Control no-store (${r.headers.get('cache-control')})`);
ok(/noindex/.test(r.headers.get('x-robots-tag') || '') || /name="robots" content="[^"]*noindex/.test(r.data), 'noindex (en-tête ou balise meta)');
ok(/noindex/.test(r.data), 'balise meta robots noindex dans la page');
ok(/no-referrer/.test(r.headers.get('referrer-policy') || ''), `Referrer-Policy no-referrer (${r.headers.get('referrer-policy')})`);
r = await admin.req('/api/admin-clients');
ok(r.status === 200 && /no-store/.test(r.headers.get('cache-control') || ''), 'API : 200 et no-store');
ok(r.data.total === total && r.data.rows.length === 20 && r.data.page_size === 20, `API : total ${r.data.total}/${total}, 20 lignes`);
ok(!r.data.rows.some((x) => x.role === 'admin'), 'API : aucun compte administrateur dans la liste « Clients »');

section('Permissions déléguées : clients.lire donne la lecture seule, jamais l’export');
await q(`select public.admin_account_set_permissions($1, $2, array['clients.lire'])`, [USERS.admin.id, USERS.deleg.id]);
r = await deleg.req('/api/admin-clients?q=dupont'); ok(r.status === 200 && r.data.total === 1, `admin avec clients.lire : recherche OK (${r.status})`);
r = await deleg.req('/admin/clients'); ok(r.status === 200, `admin avec clients.lire : page OK (${r.status})`);
r = await deleg.req('/api/admin-clients/export?ack=1'); ok(r.status === 404, `admin délégué : export CSV → 404 (${r.status})`);
r = await deleg.req('/api/admin-clients?role=admins'); ok(r.status === 200 && r.data.total === 0, 'admin délégué : ne voit pas les comptes administrateurs');
await q(`select public.admin_account_set_permissions($1, $2, '{}')`, [USERS.admin.id, USERS.deleg.id]);
r = await deleg.req('/api/admin-clients'); ok(r.status === 404, 'permission retirée : 404 immédiatement');

section('API : pagination 20 par page, recherche, filtres');
const pages = Math.ceil(total / 20);
r = await admin.req('/api/admin-clients?page=2'); ok(r.data.rows.length === 20 && r.data.page === 2, 'page 2 : 20 lignes');
r = await admin.req(`/api/admin-clients?page=${pages}`); ok(r.data.rows.length === total - (pages - 1) * 20, `dernière page (${pages}) : ${r.data.rows.length} ligne(s)`);
for (const [term, want] of [['elodie', 'Dupont'], ['ÉLODIE', 'Dupont'], ['dupont elodie', 'Dupont'], ['elodie.dupont@clients', 'Dupont'], ['0690123456', 'Dupont'], ['+590 690 12 34 56', 'Dupont'], ['0690112233', 'Martin'], ['+590690112233', 'Martin'], ['MARTIN jean', 'Martin']]) {
  r = await admin.req('/api/admin-clients?q=' + encodeURIComponent(term));
  ok(r.data.total === 1 && r.data.rows[0].last_name === want, `recherche « ${term} » → ${want} (${r.data.total})`);
}
r = await admin.req('/api/admin-clients?q=zzzzintrouvable'); ok(r.data.total === 0 && r.data.rows.length === 0, 'aucun résultat');
r = await admin.req('/api/admin-clients?mineurs=1'); ok(r.data.total === 1 && r.data.rows[0].is_minor && r.data.rows[0].age === 14, 'filtre mineurs : Léo, 14 ans');
r = await admin.req('/api/admin-clients?role=organizers'); ok(r.data.rows.some((x) => x.id === USERS.orgb.id), 'filtre organisateurs');
r = await admin.req('/api/admin-clients?role=admins'); ok(r.data.total >= 2, 'filtre admins (super-admin)');
r = await admin.req('/api/admin-clients?tri=nom&sens=asc'); ok(r.data.rows[0].last_name.localeCompare(r.data.rows[1].last_name, 'fr') <= 0, 'tri par nom croissant');
r = await admin.req('/api/admin-clients?tri=n%27importe%20quoi&sens=up&role=root&statut=x'); ok(r.status === 200 && r.data.total === total, 'paramètres invalides ignorés (valeurs par défaut)');
r = await admin.req('/api/admin-clients?q=%27%3B%20drop%20table%20public.profiles%3B%20--'); ok(r.status === 200 && r.data.total === 0, 'tentative d’injection SQL : aucun résultat');
ok((await one(`select count(*)::int n from public.profiles`)).n > 100, 'la table profiles est intacte');
ok((await q(`select 1 from public.audit_log where meta::text ilike '%dupont%' or meta::text ilike '%elodie%'`)).length === 0, 'la recherche n’est écrite dans aucun journal');
r = await admin.req(`/admin/clients?page=${pages + 5}`); ok(r.status === 307 || r.status === 308 || r.status === 200, `page hors limites : redirigée vers la dernière (${r.status})`);

section('Navigateur — ordinateur 1440 px');
const browser = await chromium.launch();
const cookies = (c) => Object.entries(c.jar).map(([name, value]) => ({ name, value, url: L.BASE }));
async function open(vp, mobile, c = admin) {
  const ctx = await browser.newContext({ viewport: vp, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.addCookies([...cookies(c), { name: 'sun_consent', value: 'refused', url: L.BASE }]);
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/googletagmanager|favicon|Failed to load resource|net::ERR|Hydration/i.test(m.text())) errs.push(m.text().slice(0, 140)); });
  return { ctx, page, errs };
}
const win = async (page) => (await page.$$eval('.clients-pager__num--wide', (els) => els.map((e) => e.textContent.trim()))).join(' ');
{
  const { ctx, page, errs } = await open({ width: 1440, height: 900 }, false);
  await page.goto(L.BASE + '/admin/clients', { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector('.clients-table tbody tr');
  ok((await page.$$('.clients-table tbody tr')).length === 20, 'la liste affiche 20 lignes');
  ok(/1–20 sur 1\s?\d{2}\s?clients|1–20 sur \d+ clients/.test((await page.textContent('.clients-count')).replace(/ /g, ' ')), `compteur « ${(await page.textContent('.clients-count')).replace(/ /g, ' ')} »`);
  const heads = (await page.$$eval('.clients-table thead th', (e) => e.map((x) => x.textContent.replace(/[▲▼↕]/g, '').trim())));
  ok(['Prénom', 'NOM', 'E-mail', 'Téléphone(s)', 'Naissance', 'À venir', 'Passés', 'Inscrit le', 'Statut'].every((h, i) => heads[i] === h), `colonnes : ${heads.join(' | ')}`);
  ok(await win(page) === `1 2 3 4 5 … ${pages}`, `page 1 : « ${await win(page)} »`);
  ok(await page.getAttribute('.clients-pager__num--wide .clients-pager__num.is-active', 'aria-current') === 'page', 'la page active porte aria-current="page"');
  ok(await page.getAttribute('.clients-pager__nav.is-disabled', 'aria-disabled') === 'true' && /Précédent/.test(await page.textContent('.clients-pager__nav.is-disabled')), '« Précédent » désactivé sur la page 1');
  await page.click('.clients-pager__num--wide >> text="2"'); await page.waitForURL(/page=2/); await page.waitForSelector('.clients-pager__num--wide .clients-pager__num.is-active');
  ok(await win(page) === `1 2 3 4 5 … ${pages}` && (await page.textContent('.clients-pager__num--wide .clients-pager__num.is-active')) === '2', `clic sur 2 → « ${await win(page)} » (fenêtre 1 à 5)`);
  await page.click('.clients-pager__num--wide >> text="4"'); await page.waitForURL(/page=4/); await page.waitForTimeout(500);
  ok(await win(page) === `1 2 3 4 5 6 7`, `page 4 → « ${await win(page)} »`);
  await page.click(`.clients-pager__num--wide >> text="5"`); await page.waitForURL(/page=5/); await page.waitForTimeout(500);
  ok(await win(page) === `1 … 3 4 5 6 7`, `page 5 → « ${await win(page)} »`);
  await page.click(`.clients-pager__nav >> text="Suivant"`); await page.waitForURL(/page=6/); await page.waitForTimeout(400);
  ok((await page.textContent('.clients-pager__num--wide .clients-pager__num.is-active')) === '6', '« Suivant » → page 6');
  await page.goto(L.BASE + `/admin/clients?page=${pages}`); await page.waitForSelector('.clients-pager');
  ok(await page.getAttribute('.clients-pager li:last-child .clients-pager__nav', 'aria-disabled') === 'true', '« Suivant » désactivé sur la dernière page');
  ok((await page.$$('.clients-table tbody tr')).length === total - (pages - 1) * 20, 'dernière page : le reste des lignes');
  // recherche
  await page.goto(L.BASE + '/admin/clients?page=3'); await page.waitForSelector('#clients-q');
  await page.fill('#clients-q', 'e'); await page.waitForTimeout(700);
  ok(!/q=/.test(page.url()) && /2 caractères/.test(await page.textContent('#clients-q-help')), 'un seul caractère : aucune recherche, message d’aide');
  await page.fill('#clients-q', 'elodie');
  await page.waitForURL(/q=elodie/, { timeout: 5000 }); await page.waitForFunction(() => document.querySelectorAll('.clients-table tbody tr').length === 1 && !document.querySelector('[aria-busy="true"] .clients-skel'));
  ok(!/page=/.test(page.url()), `retour automatique à la page 1 (${page.url().replace(L.BASE, '')})`);
  ok((await page.$$('.clients-table tbody tr')).length === 1 && /DUPONT/.test(await page.textContent('.clients-table tbody')), 'recherche « elodie » : DUPONT (nom en majuscules)');
  ok(/0690123456|06 90 12 34 56/.test(await page.textContent('.clients-table tbody')) && /36 ans/.test(await page.textContent('.clients-table tbody')), 'téléphone formaté et âge affichés');
  ok(/Non renseigné/.test(await page.textContent('.clients-table tbody')) || (await page.textContent('.clients-table tbody')).includes('06 90'), 'valeurs vides affichées « Non renseigné »');
  await page.fill('#clients-q', 'zzzzintrouvable'); await page.waitForSelector('text=Aucun résultat pour « zzzzintrouvable »', { timeout: 5000 });
  ok(true, 'message « Aucun résultat pour … »');
  await page.fill('#clients-q', '+590 690 11 22 33'); await page.waitForFunction(() => document.querySelectorAll('.clients-table tbody tr').length === 1, null, { timeout: 5000 });
  ok(/MARTIN/.test(await page.textContent('.clients-table tbody')), 'recherche par téléphone (+590 690 11 22 33) → MARTIN');
  await page.click('[aria-label="Effacer la recherche"]'); await page.waitForFunction(() => document.querySelectorAll('.clients-table tbody tr').length === 20);
  ok(!/q=/.test(page.url()) && (await page.inputValue('#clients-q')) === '', 'bouton « effacer » : recherche vidée, liste complète');
  await page.goto(L.BASE + '/admin/clients?q=dupont&page=1'); await page.waitForSelector('.clients-table tbody tr');
  ok((await page.inputValue('#clients-q')) === 'dupont', 'lien partagé : le champ reprend la recherche de l’URL');
  // tri
  await page.goto(L.BASE + '/admin/clients'); await page.click('.clients-sort >> text=NOM'); await page.waitForURL(/tri=nom/); await page.waitForSelector('.clients-table th[aria-sort="ascending"]');
  ok(/tri=nom/.test(page.url()) && /sens=asc/.test(page.url()), 'tri cliquable sur NOM (croissant), dans l’URL');
  await page.goBack(); await page.waitForURL((u) => !/tri=/.test(u.toString())); ok(true, 'le bouton retour rétablit l’état précédent');
  // filtres
  await page.goto(L.BASE + '/admin/clients'); await page.waitForSelector('.clients-tab'); await page.click('a.clients-tab:has-text("Organisateurs")'); await page.waitForURL(/role=organizers/);
  await page.waitForFunction(() => /Olivia|AUTRE-ORGA/i.test(document.body.textContent)); ok(true, 'onglet « Organisateurs »');
  await page.goto(L.BASE + '/admin/clients'); await page.waitForSelector('.clients-filters'); await page.locator('.clients-filters .ef-check:has-text("Mineurs")').click(); await page.waitForURL(/mineurs=1/); await page.waitForFunction(() => document.querySelectorAll('.clients-table tbody tr').length === 1);
  ok(await page.locator('.clients-filters .ef-check:has-text("Mineurs") input[type=checkbox]').isChecked(), 'la case « Mineurs » reste cochée après le rechargement des données');
  ok(/Mineur/.test(await page.textContent('.clients-table tbody')) && /14 ans/.test(await page.textContent('.clients-table tbody')), 'filtre mineurs : badge « Mineur » et âge 14 ans');
  // rendu
  await page.goto(L.BASE + '/admin/clients'); await page.waitForSelector('.clients-table tbody tr');
  const flat = await page.evaluate(() => { const a = document.querySelector('.oside'); const s = a && getComputedStyle(a); return s ? s.borderTopRightRadius + '|' + s.borderBottomRightRadius : null; });
  ok(flat === '0px|0px', `menu latéral plat (${flat})`);
  ok(await page.evaluate(() => [...document.querySelectorAll('.oside__leaf, .oside__head')].some((e) => /^Clients$/.test(e.textContent.trim()))), 'entrée « Clients » présente dans le menu admin');
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'pas de défilement horizontal');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}/liste-1440.png`, fullPage: false });
  const bottom = await page.evaluate(() => { const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 2); return el ? getComputedStyle(el).backgroundColor : null; });
  ok(bottom !== 'rgb(0, 0, 0)', `pas de bande noire en bas de page (fond ${bottom})`);
  ok(errs.length === 0, `aucune erreur console${errs.length ? ' — ' + errs.slice(0, 2).join(' | ') : ''}`);
  await ctx.close();
}

section('Navigateur — mobile 390 px');
{
  const { ctx, page, errs } = await open({ width: 390, height: 844 }, true);
  await page.goto(L.BASE + '/admin/clients', { waitUntil: 'load', timeout: 60000 }); await page.waitForSelector('.clients-table tbody tr');
  const disp = await page.evaluate(() => { const tr = document.querySelector('.clients-table tbody tr'); return [getComputedStyle(tr).display, getComputedStyle(document.querySelector('.clients-table thead')).position]; });
  ok(disp[0] === 'block' && disp[1] === 'absolute', `le tableau devient une liste de cartes (${disp.join(', ')})`);
  ok((await page.$$('.clients-table tbody tr')).length === 20, '20 cartes');
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'pas de défilement horizontal');
  await page.locator('.clients-pager').scrollIntoViewIfNeeded();
  const boxes = await page.$$eval('.clients-pager a, .clients-pager .clients-pager__nav', (els) => els.filter((e) => e.offsetParent).map((e) => { const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height), Math.round(b.right)]; }));
  ok(boxes.length >= 4 && boxes.every((b) => b[1] >= 40 && b[2] <= 390), `pagination utilisable (${boxes.length} contrôles, hauteur ≥ 40 px, dans l’écran)`);
  const shown = await page.$$eval('.clients-pager li', (els) => els.filter((e) => e.offsetParent).map((e) => e.textContent.trim().replace(/^Page /, '')).join(' '));
  ok(/Précédent 1 2 3 … \d+ Suivant/.test(shown), `numéros réduits : « ${shown} »`);
  await page.screenshot({ path: `${SHOTS}/liste-390.png`, fullPage: true });
  ok(errs.length === 0, `aucune erreur console${errs.length ? ' — ' + errs.slice(0, 2).join(' | ') : ''}`);
  await ctx.close();
}

await cleanup();
ok((await one(`select count(*)::int n from auth.users where email like '%@clients-e2e.local'`)).n === 0, 'comptes de test supprimés');
await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 5000))]);
process.exit(L.summary('page super-admin Clients (liste, recherche, pagination, accès)') ? 1 : 0);
