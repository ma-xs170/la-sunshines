// s19 — fiche client /admin/clients/[id] : accès (404 page+API pour tout non autorisé), ouverture (audit_log dédupliqué), édition avec motif
// (avant/après en base, conflit de version, e-mail synchronisé côté Auth), sécurité (mot de passe, sessions, suspension), RGPD (export, anonymisation).
// Comptes de test (@clients-e2e.local) créés puis SUPPRIMÉS. Aucun e-mail réel : Resend et GoTrue sont simulés.
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

const ELO = 'c9000000-0000-4000-8000-000000000011', LEO = 'c9000000-0000-4000-8000-000000000012';
await q(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, created_at) values
  ($1, 'elodie.dupont@clients-e2e.local', now(), '{"first_name":"Élodie","last_name":"Dupont","phone":"0690123456"}', now() - interval '10 days'),
  ($2, 'leo.petit@clients-e2e.local', now(), '{"first_name":"Léo","last_name":"Petit"}', now() - interval '2 days')`, [ELO, LEO]);
await q(`update public.profiles set birth_date = date '1990-05-04' where id = $1`, [ELO]);
await q(`update public.profiles set birth_date = (current_date - interval '14 years')::date where id = $1`, [LEO]);

const EVF = 'e9000000-0000-4000-8000-000000000001', EVP = 'e9000000-0000-4000-8000-000000000002';
await q(`insert into public.ticketed_events (id, event_slug, starts_at, capacity, status) values ($1, 's19-evt-futur', now() + interval '25 days', 100, 'published'), ($2, 's19-evt-passe', now() - interval '25 days', 100, 'published')`, [EVF, EVP]);
const TF = 'a9000000-0000-4000-8000-00000000000a', TP = 'b9000000-0000-4000-8000-00000000000b';
await q(`insert into public.ticket_tiers (id, ticketed_event_id, name, price_cents, quantity_total, max_per_order) values ($1, $3, 'Standard', 1500, 50, 6), ($2, $4, 'Early', 1000, 50, 6)`, [TF, TP, EVF, EVP]);
const OF = 'd9000000-0000-4000-8000-000000000001', OP = 'd9000000-0000-4000-8000-000000000002';
await q(`insert into public.orders (id, order_number, user_id, ticketed_event_id, event_slug, status, buyer_email, buyer_first_name, buyer_last_name, buyer_phone, subtotal_cents, fee_cents, total_cents, paid_at, guardian_consent_at, terms_accepted_at, terms_version) values
  ($1, 'SUN-919001', $5, $3, 's19-evt-futur', 'paid', 'elodie.dupont@clients-e2e.local', 'Élodie', 'Dupont', '0690123456', 1500, 0, 1500, now(), now(), now(), 'v1'),
  ($2, 'SUN-919002', $5, $4, 's19-evt-passe', 'paid', 'elodie.dupont@clients-e2e.local', 'Élodie', 'Dupont', '0690123456', 1000, 0, 1000, now() - interval '30 days', null, now() - interval '30 days', 'v1')`, [OF, OP, EVF, EVP, ELO]);
await q(`insert into public.order_items (id, order_id, tier_id, quantity, unit_price_cents, participants, event_title, event_starts_at, tier_name) values
  ('f9000000-0000-4000-8000-000000000001', $1, $3, 1, 1500, '[{"first_name":"Élodie","last_name":"Dupont"}]', 'S19 Futur', now() + interval '25 days', 'Standard'),
  ('f9000000-0000-4000-8000-000000000002', $2, $4, 1, 1000, '[{"first_name":"Élodie","last_name":"Dupont"}]', 'S19 Passé', now() - interval '25 days', 'Early')`, [OF, OP, TF, TP]);
await q(`insert into public.tickets (id, order_id, order_item_id, ticketed_event_id, tier_id, user_id, code, holder_first_name, holder_last_name, status, used_at, reference) values
  ('19000000-0000-4000-8000-000000000001', $1, 'f9000000-0000-4000-8000-000000000001', $3, $5, $7, 's19-code-1', 'Élodie', 'Dupont', 'valid', null, 'LS-S19001'),
  ('19000000-0000-4000-8000-000000000002', $2, 'f9000000-0000-4000-8000-000000000002', $4, $6, $7, 's19-code-2', 'Élodie', 'Dupont', 'used', now() - interval '25 days', 'LS-S19002')`, [OF, OP, EVF, EVP, TF, TP, ELO]);
await q(`insert into auth.sessions (user_id) values ($1)`, [LEO]);

const admin = await as(USERS.admin), deleg = await as(USERS.deleg), cust = await as(USERS.cust), orgb = await as(USERS.orgb);
const anon = new L.Client();
const orgId = (await q(`select id from public.organizers where is_default`))[0].id;
await q(`insert into public.organizer_members (organizer_id, user_id, role) values ($1, $2, 'owner') on conflict do nothing`, [orgId, USERS.orgb.id]);

section('Accès à la fiche : 404 pour tout compte non autorisé (page ET chaque route API)');
const apiPaths = (id) => [[`/api/admin-clients/${id}`, 'GET'], [`/api/admin-clients/${id}/check`, 'POST'], [`/api/admin-clients/${id}/status`, 'POST'],
  [`/api/admin-clients/${id}/revoke-sessions`, 'POST'], [`/api/admin-clients/${id}/password-reset`, 'POST'], [`/api/admin-clients/${id}/anonymize`, 'POST'], [`/api/admin-clients/${id}/export`, 'GET']];
for (const [label, c] of [['visiteur non connecté', anon], ['client', cust], ['organisateur', orgb]]) {
  let r = await c.req(`/admin/clients/${ELO}`); ok(r.status === 404, `${label} : fiche → 404 (${r.status})`);
  for (const [p, method] of apiPaths(ELO)) { r = await c.req(p, { method, body: method === 'POST' ? {} : undefined }); ok(r.status === 404, `${label} : ${p} → 404 (${r.status})`); }
}
let r = await admin.req(`/admin/clients/00000000-0000-0000-0000-000000000000`); ok(r.status === 404, `identifiant inexistant → 404 (${r.status})`);
r = await admin.req(`/admin/clients/pas-un-uuid`); ok(r.status === 404, `identifiant mal formé → 404 (${r.status})`);

section('Ouverture de la fiche : contenu et journal de consultation dédupliqué');
r = await admin.req(`/admin/clients/${ELO}`);
ok(r.status === 200 && /DUPONT/.test(r.data) && /elodie.dupont@clients-e2e.local/.test(r.data), 'la fiche affiche nom et e-mail');
ok(/no-store/.test(r.headers.get('cache-control') || '') && /noindex/.test(r.data), 'no-store et noindex sur la fiche');
let views = (await q(`select count(*)::int n from public.audit_log where action = 'customer.view' and entity_id = $1`, [ELO]))[0].n;
ok(views === 1, `1re consultation journalisée (${views})`);
await admin.req(`/admin/clients/${ELO}`);
views = (await q(`select count(*)::int n from public.audit_log where action = 'customer.view' and entity_id = $1`, [ELO]))[0].n;
ok(views === 1, `2e consultation dans les 10 minutes : pas de doublon (${views})`);
r = await admin.req(`/api/admin-clients/${ELO}`);
ok(r.status === 200 && r.data.profile.reference.startsWith('CLI.') && r.data.orders.length === 2 && r.data.orders[0].tickets, 'API détail : profil, commandes et billets');

section('Édition : validation, motif obligatoire, conflit de version, e-mail synchronisé côté Auth');
const detail = (await admin.req(`/api/admin-clients/${ELO}`)).data;
const upd = detail.profile.updated_at;
const body = (over = {}) => ({ first_name: 'Élodie', last_name: 'Dupont', phone: '0690123456', phone2: '', email: 'elodie.dupont@clients-e2e.local', birth_date: '1990-05-04', reason: '', expected_updated_at: upd, ...over });
r = await admin.req(`/api/admin-clients/${ELO}`, { method: 'PATCH', body: body({ last_name: '' }) }); ok(r.status === 400, `nom vide refusé (${r.status})`);
r = await admin.req(`/api/admin-clients/${ELO}`, { method: 'PATCH', body: body({ email: 'nouvelle@clients-e2e.local' }) }); ok(r.status === 400, `changement d’e-mail sans motif refusé (${r.status})`);
r = await admin.req(`/api/admin-clients/${ELO}`, { method: 'PATCH', body: body({ expected_updated_at: '2000-01-01T00:00:00Z' }) }); ok(r.status === 409, `version périmée → conflit (${r.status})`);
r = await deleg.req(`/api/admin-clients/${ELO}`, { method: 'PATCH', body: body({ last_name: 'Interdit' }) }); ok(r.status === 404, `admin sans clients.modifier : 404 (${r.status})`);

r = await admin.req(`/api/admin-clients/${ELO}/check`, { method: 'POST', body: body({ last_name: 'Durand', email: 'elodie.nouvelle@clients-e2e.local', reason: 'Demande écrite (ticket 42)' }) });
ok(r.status === 200 && r.data.before.last_name === 'Dupont' && r.data.after.last_name === 'Durand' && r.data.email_changed === true, `aperçu avant/après (${JSON.stringify(r.data)})`);
ok((await q(`select 1 from public.profiles where id = $1 and last_name = 'Dupont'`, [ELO])).length === 1, 'l’aperçu n’a rien écrit');

r = await admin.req(`/api/admin-clients/${ELO}`, { method: 'PATCH', body: body({ last_name: 'Durand', email: 'elodie.nouvelle@clients-e2e.local', reason: 'Demande écrite (ticket 42)' }) });
ok(r.status === 200 && Array.isArray(r.data.warnings), `enregistrement OK (${r.status})`);
const p1 = (await q(`select last_name, email from public.profiles where id = $1`, [ELO]))[0];
ok(p1.last_name === 'Durand' && p1.email === 'elodie.nouvelle@clients-e2e.local', `profil mis à jour (${JSON.stringify(p1)})`);
const authEmail = (await q(`select email from auth.users where id = $1`, [ELO]))[0].email;
ok(authEmail === 'elodie.nouvelle@clients-e2e.local', `l’identifiant de connexion Supabase Auth est synchronisé (${authEmail})`);
const audit1 = (await q(`select before, after, meta from public.audit_log where action = 'customer.update' and entity_id = $1 order by id desc limit 1`, [ELO]))[0];
ok(audit1.before.email === 'elodie.dupont@clients-e2e.local' && audit1.after.email === 'elodie.nouvelle@clients-e2e.local' && audit1.meta.reason === 'Demande écrite (ticket 42)', `audit avant/après avec motif (${JSON.stringify(audit1)})`);
ok((await q(`select 1 from public.audit_log where action = 'customer.email_notice' and entity_id = $1`, [ELO])).length === 1, 'notification de changement d’e-mail journalisée');

section('Admin délégué avec clients.modifier : peut éditer, ne peut ni anonymiser ni exporter');
await q(`select public.admin_account_set_permissions($1, $2, array['clients.modifier'])`, [USERS.admin.id, USERS.deleg.id]);
const updLeo = (await deleg.req(`/api/admin-clients/${LEO}`)).data.profile.updated_at;
r = await deleg.req(`/api/admin-clients/${LEO}`, { method: 'PATCH', body: { first_name: 'Léo', last_name: 'Petit-Modifié', phone: '', phone2: '', email: 'leo.petit@clients-e2e.local', birth_date: (await deleg.req(`/api/admin-clients/${LEO}`)).data.profile.birth_date, reason: '', expected_updated_at: updLeo } });
ok(r.status === 200, `admin délégué (clients.modifier) : édition OK (${r.status})`);
r = await deleg.req(`/api/admin-clients/${LEO}/anonymize`, { method: 'POST', body: { confirm_email: 'leo.petit@clients-e2e.local' } }); ok(r.status === 404, `admin délégué : anonymisation → 404 (${r.status})`);
r = await deleg.req(`/api/admin-clients/${LEO}/export`); ok(r.status === 404, `admin délégué : export JSON → 404 (${r.status})`);

section('Sécurité : réinitialisation du mot de passe, déconnexion des sessions, suspension');
r = await admin.req(`/api/admin-clients/${LEO}/password-reset`, { method: 'POST' });
ok(r.status === 200 && r.data.sent === true, `e-mail de réinitialisation envoyé (${JSON.stringify(r.data)})`);
ok((await q(`select 1 from public.audit_log where action = 'customer.password_reset' and entity_id = $1`, [LEO])).length === 1, 'réinitialisation journalisée');
ok((await q(`select meta::text as m from public.audit_log where action = 'customer.password_reset' and entity_id = $1`, [LEO]))[0].m.indexOf('password') === -1, 'aucun mot de passe dans le journal');
ok((await q(`select count(*)::int n from auth.sessions where user_id = $1`, [LEO]))[0].n === 1, 'session active avant déconnexion');
r = await admin.req(`/api/admin-clients/${LEO}/revoke-sessions`, { method: 'POST' });
ok(r.status === 200 && (await q(`select count(*)::int n from auth.sessions where user_id = $1`, [LEO]))[0].n === 0, `sessions déconnectées (${r.status})`);
r = await admin.req(`/api/admin-clients/${LEO}/status`, { method: 'POST', body: { status: 'suspended', reason: '' } }); ok(r.status === 400, `suspension sans motif refusée (${r.status})`);
r = await admin.req(`/api/admin-clients/${LEO}/status`, { method: 'POST', body: { status: 'suspended', reason: 'Signalement famille' } });
ok(r.status === 200, `compte suspendu (${r.status})`);
ok((await q(`select account_status from public.profiles where id = $1`, [LEO]))[0].account_status === 'suspended', 'statut suspendu en base');
ok((await q(`select banned_until > now() as b from auth.users where id = $1`, [LEO]))[0].b === true, 'compte bloqué côté Auth');
r = await admin.req(`/api/admin-clients/${LEO}/status`, { method: 'POST', body: { status: 'active', reason: 'Vérifié, aucune suite' } });
ok(r.status === 200 && (await q(`select account_status from public.profiles where id = $1`, [LEO]))[0].account_status === 'active', 'compte réactivé');

section('RGPD : export JSON (super), anonymisation (double confirmation, refus si billet à venir)');
r = await admin.req(`/api/admin-clients/${ELO}/export`);
ok(r.status === 200 && /application\/json/.test(r.headers.get('content-type') || '') && r.data.profile.email === 'elodie.nouvelle@clients-e2e.local', `export JSON (${r.status})`);
r = await admin.req(`/api/admin-clients/${ELO}/anonymize`, { method: 'POST', body: { confirm_email: 'mauvaise@adresse.fr' } }); ok(r.status === 400, `confirmation incorrecte refusée (${r.status})`);
r = await admin.req(`/api/admin-clients/${ELO}/anonymize`, { method: 'POST', body: { confirm_email: 'elodie.nouvelle@clients-e2e.local' } }); ok(r.status === 409, `refusé : billet valide à venir (${r.status})`);
await q(`update public.tickets set status = 'cancelled', cancelled_at = now() where id = '19000000-0000-4000-8000-000000000001'`);
r = await admin.req(`/api/admin-clients/${ELO}/anonymize`, { method: 'POST', body: { confirm_email: 'elodie.nouvelle@clients-e2e.local' } });
ok(r.status === 200 && r.data.orders_kept === 2, `anonymisation effectuée, commandes conservées (${JSON.stringify(r.data)})`);
const p2 = (await q(`select first_name, email, account_status from public.profiles where id = $1`, [ELO]))[0];
ok(p2.first_name === 'Compte' && p2.email === '' && p2.account_status === 'anonymized', `identité retirée (${JSON.stringify(p2)})`);
ok((await q(`select count(*)::int n from public.orders where user_id = $1`, [ELO]))[0].n === 2, 'les commandes restent pour la comptabilité');
r = await admin.req(`/api/admin-clients/${ELO}`, { method: 'PATCH', body: body({ last_name: 'X', reason: 'Tentative après anonymisation' }) }); ok(r.status === 409, `un compte anonymisé ne peut plus être modifié (${r.status})`);

section('Navigateur — ouverture de la fiche, onglets, saisie avec motif (1440 px)');
const browser = await chromium.launch();
const cookies = (c) => Object.entries(c.jar).map(([name, value]) => ({ name, value, url: L.BASE }));
async function open(c, vp = { width: 1440, height: 1000 }) {
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.addCookies([...cookies(c), { name: 'sun_consent', value: 'refused', url: L.BASE }]);
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/googletagmanager|favicon|Failed to load resource|net::ERR|Hydration/i.test(m.text())) errs.push(m.text().slice(0, 140)); });
  return { ctx, page, errs };
}
{
  const { ctx, page, errs } = await open(admin);
  await page.goto(L.BASE + `/admin/clients/${LEO}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.clients-detail__head');
  ok((await page.textContent('.clients-detail__head')).includes('PETIT'), 'en-tête : nom en majuscules');
  ok(/Mineur/.test(await page.textContent('.clients-detail__head')), 'badge « Mineur » affiché');
  await page.click('.org-tab >> text=Évènements'); await page.waitForSelector('text=Aucun évènement');
  ok(true, 'onglet Évènements : « Aucun évènement à venir / passé »');
  await page.click('.org-tab >> text=Informations'); await page.waitForSelector('.ef-card');
  await page.click('button:has-text("Modifier")');
  await page.fill('#in-last_name', 'Petit-Nouveau');
  await page.click('button:has-text("Vérifier et enregistrer")');
  await page.waitForSelector('.clients-dialog');
  ok(/Petit-Nouveau/.test(await page.textContent('.clients-dialog')), 'fenêtre de confirmation : avant/après affiché');
  await page.click('.clients-dialog button:has-text("Confirmer")');
  await page.waitForSelector('text=Modifications enregistrées.');
  ok((await q(`select last_name from public.profiles where id = $1`, [LEO]))[0].last_name === 'Petit-Nouveau', 'modification écrite en base depuis le navigateur');
  ok((await q(`select 1 from public.audit_log where action = 'customer.update' and entity_id = $1 and after ->> 'last_name' = 'Petit-Nouveau'`, [LEO])).length === 1, 'entrée dans audit_log (avant/après)');
  await page.screenshot({ path: `${SHOTS}/fiche-1440.png` });
  const bottom = await page.evaluate(() => { const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 2); return el ? getComputedStyle(el).backgroundColor : null; });
  ok(bottom !== 'rgb(0, 0, 0)', `pas de bande noire en bas de page (${bottom})`);
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'pas de défilement horizontal');
  ok(errs.length === 0, `aucune erreur console${errs.length ? ' — ' + errs.slice(0, 2).join(' | ') : ''}`);
  await ctx.close();
}

section('Navigateur — mobile 390 px');
{
  const { ctx, page, errs } = await open(admin, { width: 390, height: 844 });
  await page.goto(L.BASE + `/admin/clients/${LEO}`, { waitUntil: 'load', timeout: 60000 }); await page.waitForSelector('.clients-detail__head');
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'pas de défilement horizontal (390 px)');
  await page.screenshot({ path: `${SHOTS}/fiche-390.png`, fullPage: true });
  ok(errs.length === 0, `aucune erreur console${errs.length ? ' — ' + errs.slice(0, 2).join(' | ') : ''}`);
  await ctx.close();
}

await cleanup();
ok((await one(`select count(*)::int n from auth.users where email like '%@clients-e2e.local'`)).n === 0, 'comptes de test supprimés');
await Promise.race([browser.close(), new Promise((res) => setTimeout(res, 5000))]);
process.exit(L.summary('fiche client (accès, édition, sécurité, RGPD)') ? 1 : 0);
