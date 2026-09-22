// s19 — pages organisateur réelles (série 2) : frais et paiement (mode « inclus », minimum, surcharges) appliqués au paiement,
// lineup, membres, impression PDF, audience anonyme, pages de statistiques et rôles.
import * as L from './lib.mjs';
const { ok, section, as, q, one, webhook, sessionCompleted, stripeState, USERS } = L;
const SLUG = 'la-nuit-des-ombres';

await L.resetDb();
await q(`truncate public.event_views, public.event_lineup`);
await q(`update public.organizers set fee_percent_override = null, fee_fixed_override = null`);
const admin = await as(USERS.admin), cust = await as(USERS.cust), owner = await as(USERS.staff), stf = await as(USERS.cust2);
const tiers = await L.setupEvent(admin);
const orga = (await one(`select id from public.organizers where is_default`)).id;
await q(`truncate public.organizer_members cascade`);
await q(`insert into public.organizer_members (organizer_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'staff')`, [orga, USERS.staff.id, USERS.cust2.id]);
await q(`update public.ticketed_events set organizer_id = $1 where event_slug = $2`, [orga, SLUG]);
await q(`update public.app_settings set value = '3' where key = 'fee_percent'`);
await q(`update public.app_settings set value = '50' where key = 'fee_fixed_cents'`);
const orderOf = (n) => one('select * from public.orders where order_number = $1', [n]);

section('Frais et paiement : droits et validation');
let r = await stf.req(`/api/organisateur/events/${SLUG}/fees`, { method: 'PUT', body: { mode: 'included', min_order_cents: 0 } });
ok(r.status === 403, `le staff ne règle pas les frais (${r.status})`);
r = await owner.req(`/api/organisateur/events/${SLUG}/fees`, { method: 'PUT', body: { mode: 'gratuit', min_order_cents: 0 } });
ok(r.status === 400, `mode inconnu → 400 (${r.status})`);
r = await owner.req(`/api/organisateur/events/${SLUG}/fees`, { method: 'PUT', body: { mode: 'included', min_order_cents: 20 } });
ok(r.status === 400, `minimum entre 0 et 0,50 € → 400 (${r.status} ${r.data?.error})`);
r = await owner.req(`/organisateur/evenements/${SLUG}/frais`);
ok(r.status === 200 && /Frais de service/.test(r.data) && /Payés par le client/.test(r.data) && /Inclus dans le prix/.test(r.data) && /gratuit ne demande aucun paiement/.test(r.data), 'page Frais et paiement');

section('Mode « inclus dans le prix » + montant minimum, au paiement');
r = await owner.req(`/api/organisateur/events/${SLUG}/fees`, { method: 'PUT', body: { mode: 'included', min_order_cents: 2000 } });
ok(r.status === 200, `enregistré (${r.status})`);
ok((await one(`select fee_mode, min_order_cents from public.ticketed_events where event_slug = $1`, [SLUG])).fee_mode === 'included', 'mode enregistré en base');
ok((await q(`select 1 from public.audit_log where action = 'event.fee_settings'`)).length === 1, 'journalisé');
r = await cust.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.std, 1]]) });
ok(r.status === 400 && /minimum/.test(r.data.error) && /20,00/.test(r.data.error), `1 × 15,00 € < minimum 20,00 € → 400 « ${r.data.error} »`);
ok((await q('select count(*)::int as n from public.orders'))[0].n === 0, 'aucune commande créée en cas de refus');
r = await cust.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.std, 2]]) });
ok(r.status === 200 && /^http/.test(r.data.url), `2 × 15,00 € : accepté (${r.status} ${r.data?.error ?? ''})`);
let order = await orderOf(r.data.order_number);
ok(order.subtotal_cents === 3000 && order.fee_cents === 0 && order.total_cents === 3000, `le client paie le prix affiché : ${order.subtotal_cents}/${order.fee_cents}/${order.total_cents}`);
ok(order.fee_absorbed_cents === 140, `frais 3 % + 0,50 € = 1,40 € pris sur l'organisateur (${order.fee_absorbed_cents})`);
const sess = Object.values((await stripeState()).sessions).at(-1);
ok(sess.amount_total === 3000 && !sess.lines.some((l) => /Frais/.test(l.name ?? '')), `Stripe encaisse 30,00 € sans ligne de frais (${JSON.stringify(sess.lines.map((l) => [l.name, l.unit]))})`);
await webhook('checkout.session.completed', sessionCompleted(order));
const fin = (await one(`select public.org_finance($1, $2) as f`, [USERS.staff.id, SLUG])).f;
ok(fin.gross_cents === 3000 && fin.fees_cents === 140 && fin.net_cents === 2860, `finance : brut 30,00 €, frais 1,40 €, net 28,60 € (${JSON.stringify([fin.gross_cents, fin.fees_cents, fin.net_cents])})`);

section('Surcharge de frais (posée par un admin) + mode « payés par le client »');
await q(`update public.organizers set fee_percent_override = 5, fee_fixed_override = 0 where id = $1`, [orga]);
r = await owner.req(`/api/organisateur/events/${SLUG}/fees`, { method: 'PUT', body: { mode: 'customer', min_order_cents: 0 } });
r = await cust.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.early, 1]]) });   // 10,00 €
order = await orderOf(r.data.order_number);
ok(order.subtotal_cents === 1000 && order.fee_cents === 50 && order.total_cents === 1050 && order.fee_absorbed_cents === 0, `surcharge organisateur 5 % : 10,00 € + 0,50 € = 10,50 € (${order.subtotal_cents}/${order.fee_cents}/${order.total_cents})`);
await q(`update public.ticketed_events set fee_percent_override = 0, fee_fixed_override = 0 where event_slug = $1`, [SLUG]);
r = await cust.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.early, 1]]) });
order = await orderOf(r.data.order_number);
ok(order.fee_cents === 0 && order.total_cents === 1000, `la surcharge de l'évènement (0 %) prime sur celle de l'organisateur (${order.fee_cents})`);

section('Lineup');
r = await stf.req(`/api/organisateur/events/${SLUG}/lineup`, { method: 'PUT', body: { items: [{ name: 'X', role: 'dj' }] } });
ok(r.status === 403, `le staff ne modifie pas le lineup (${r.status})`);
r = await owner.req(`/api/organisateur/events/${SLUG}/lineup`, { method: 'PUT', body: { items: [{ name: '', role: 'dj' }] } });
ok(r.status === 400, `nom vide → 400 (${r.status})`);
r = await owner.req(`/api/organisateur/events/${SLUG}/lineup`, { method: 'PUT', body: { items: [{ name: 'DJ Syxtee', role: 'dj' }, { name: 'Invitée <b>x</b>', role: 'artiste', starts_at: '2026-10-17T23:00:00Z' }] } });
ok(r.status === 200 && r.data.count === 2, `lineup enregistré (${r.status})`);
r = await owner.req(`/organisateur/evenements/${SLUG}/lineup`);
ok(r.status === 200 && /DJ Syxtee/.test(r.data) && !/<b>x<\/b>/.test(r.data), 'page Lineup : noms rendus, HTML échappé');

section('Membres et rôles');
r = await stf.req('/api/organisateur/members', { method: 'POST', body: { action: 'add', org: orga, email: USERS.cust.email, role: 'staff' } });
ok(r.status === 403, `le staff ne gère pas les membres (${r.status})`);
r = await owner.req('/api/organisateur/members', { method: 'POST', body: { action: 'add', org: orga, email: 'inconnu@test.local', role: 'staff' } });
ok(r.status === 404, `compte inexistant → 404 (${r.status})`);
r = await owner.req('/api/organisateur/members', { method: 'POST', body: { action: 'add', org: orga, email: USERS.cust.email, role: 'manager' } });
ok(r.status === 200, `ajout d'un gestionnaire (${r.status} ${r.data?.error ?? ''})`);
r = await owner.req('/api/organisateur/members', { method: 'POST', body: { action: 'add', org: orga, email: USERS.cust.email, role: 'manager' } });
ok(r.status === 409, `déjà membre → 409 (${r.status})`);
r = await owner.req('/organisateur/organisation/membres');
ok(r.status === 200 && /cust@test\.local/.test(r.data) && /Membres/.test(r.data), 'page Membres et rôles');
r = await owner.req('/api/organisateur/members', { method: 'POST', body: { action: 'remove', org: orga, user: USERS.staff.id } });
ok(r.status === 409, `dernier propriétaire protégé → 409 (${r.status})`);
r = await owner.req('/api/organisateur/members', { method: 'POST', body: { action: 'role', org: orga, user: USERS.cust.id, role: 'staff' } });
ok(r.status === 200, `changement de rôle (${r.status})`);
r = await owner.req('/api/organisateur/members', { method: 'POST', body: { action: 'remove', org: orga, user: USERS.cust.id } });
ok(r.status === 200, `retrait (${r.status})`);
ok((await q(`select 1 from public.audit_log where action in ('org.member_add','org.member_role','org.member_remove')`)).length === 3, 'membres journalisés (3)');
r = await stf.req('/organisateur/organisation/membres');
ok(r.status >= 300 && r.status < 400, `le staff est renvoyé hors de la page Membres (${r.status})`);

section('Impression de billets (PDF)');
r = await owner.req(`/api/organisateur/events/${SLUG}/print`, { raw: 'buffer' });
ok(r.status === 200 && /pdf/.test(r.headers.get('content-type') ?? ''), `PDF des billets valides (${r.status} ${r.headers.get('content-type')})`);
r = await stf.req(`/api/organisateur/events/${SLUG}/print`);
ok(r.status === 403, `le staff n'imprime pas (${r.status})`);
r = await owner.req(`/api/organisateur/events/${SLUG}/print?tier=pas-un-uuid`);
ok(r.status === 400, `tarif invalide → 400 (${r.status})`);
ok((await q(`select 1 from public.audit_log where action = 'organizer.tickets_print'`)).length === 1, 'impression journalisée');

section('Audience anonyme');
const anon = new L.Client();
r = await anon.req('/api/track/view', { method: 'POST', body: { slug: SLUG, ref: 'https://l.instagram.com/?u=x' }, headers: { 'x-vercel-ip-country': 'GP' } });
ok(r.status === 204, `vue comptée (${r.status})`);
r = await anon.req('/api/track/view', { method: 'POST', body: { slug: 'slug inconnu !' } });
ok(r.status === 204, `slug invalide ignoré (${r.status})`);
const v = await q(`select source, country, views from public.event_views where event_slug = $1`, [SLUG]);
ok(v.length === 1 && v[0].source === 'instagram' && v[0].country === 'GP' && v[0].views === 1, `canal Instagram, pays GP (${JSON.stringify(v)})`);
ok((await q(`select column_name from information_schema.columns where table_name = 'event_views'`)).every((c) => !/ip|user|agent/i.test(c.column_name)), 'aucune colonne d\'identification dans event_views');

section('Toutes les pages du menu répondent');
const pages = ['', '/apercu', '/frais', '/lineup', '/staff', '/staff/qr', '/presences', '/roles', '/liste-entree', '/liste-entree?vue=entres', '/message', '/renvoi', '/impression', '/medias',
  '/statistiques/vue-densemble', '/statistiques/audience', '/statistiques/acquisition', '/statistiques/tunnel', '/statistiques/participants', '/statistiques/canaux', '/statistiques/geographie', '/statistiques/performance', '/stats'];
for (const p of pages) { r = await owner.req(`/organisateur/evenements/${SLUG}${p}`); ok(r.status === 200 && /<h1/.test(r.data), `${p || '(tableau de bord)'} → ${r.status}`); }
r = await owner.req(`/organisateur/evenements/${SLUG}/statistiques/inconnu`);
ok(r.status === 404, `vue de statistiques inconnue → 404 (${r.status})`);
r = await owner.req(`/organisateur/evenements/${SLUG}/statistiques/audience`);
ok(/Visites de la page/.test(r.data) && /Instagram|Accès direct/.test(r.data) || /Visites de la page/.test(r.data), 'audience : visites affichées');
r = await owner.req(`/organisateur/evenements/${SLUG}/statistiques/acquisition`);
ok(/Instagram/.test(r.data), 'acquisition : canal Instagram');
r = await owner.req(`/organisateur/evenements/${SLUG}/statistiques/geographie`);
ok(/Guadeloupe/.test(r.data), 'géographie : GP → Guadeloupe');
r = await owner.req(`/organisateur/evenements/${SLUG}/statistiques/canaux`);
ok(/Vente en ligne/.test(r.data), 'canaux : vente en ligne');
for (const p of ['/frais', '/lineup', '/staff', '/impression', '/statistiques/tunnel', '/roles']) { r = await stf.req(`/organisateur/evenements/${SLUG}${p}`); ok(r.status === 404, `${p} : le staff n'y accède pas → 404 (${r.status})`); }

process.exit(L.summary('pages organisateur réelles (série 2)') ? 1 : 0);
