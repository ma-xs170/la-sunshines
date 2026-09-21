// Analyse et Paiements (banc local) : rôles, chiffres, isolation, inscription Stripe (faux Stripe), compte lié une seule fois.
import * as L from './lib.mjs';
const { ok, section, as, q, one, webhook, sessionCompleted, stripeState, USERS } = L;
const A = 'la-nuit-des-ombres', B = 'welcome-to-dominica';

await L.resetDb();
await q(`truncate public.organizer_members cascade`);
await q(`delete from public.organizers where not is_default`);
await q(`update public.organizers set stripe_account_id = '', stripe_ready = false where is_default`);
const admin = await as(USERS.admin), owner = await as(USERS.staff), mgr = await as(USERS.cust), crew = await as(USERS.cust2), orgb = await as(USERS.orgb), anon = new L.Client();
const tiers = await L.setupEvent(admin);
const tiersB = await L.setupEvent(admin, { slug: B, tiers: [{ key: 's', name: 'Standard B', price_cents: 1200, quantity_total: 5, max_per_order: 5 }] });
const orgA = (await one(`select id from public.organizers where is_default`)).id;
const [{ id: orgB }] = await q(`insert into public.organizers (name, responsible_name, contact_email) values ('Autre Orga', 'Dupont Olivia', 'b@test.local') returning id`);
await q(`update public.ticketed_events set organizer_id = $1 where event_slug = $2`, [orgB, B]);
await q(`insert into public.organizer_members (organizer_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'manager'), ($1, $4, 'staff'), ($5, $6, 'owner')`, [orgA, USERS.staff.id, USERS.cust.id, USERS.cust2.id, orgB, USERS.orgb.id]);
const buy = async (client, slug, ids, key, qty) => {
  const r = await client.req('/api/checkout', { method: 'POST', body: L.checkoutBody(slug, [[ids[key], qty]]) });
  if (r.status !== 200) throw new Error('checkout ' + JSON.stringify(r.data));
  await webhook('checkout.session.completed', sessionCompleted(await one('select * from public.orders where order_number = $1', [r.data.order_number])));
};
await buy(admin, A, tiers, 'std', 2);
await buy(admin, A, tiers, 'early', 1);
await buy(admin, B, tiersB, 's', 1);

section('Analyse : accès');
let r = await anon.req('/organisateur/analyse'); ok(r.status >= 300 && r.status < 400 && /connexion/.test(r.headers.get('location') ?? ''), `sans connexion → connexion (${r.status})`);
r = await crew.req('/organisateur/analyse'); ok(r.status >= 300 && r.status < 400, `staff → refusé (${r.status})`);
r = await mgr.req('/organisateur/analyse'); ok(r.status === 200 && /Évolution des ventes/.test(r.data), `gestionnaire → 200 (${r.status})`);
r = await owner.req('/organisateur/analyse');
ok(r.status === 200 && /Billets vendus/.test(r.data) && /Chiffre d’affaires/.test(r.data) && /Par événement/.test(r.data) && /Par tarif/.test(r.data), 'propriétaire : chiffres clés, événements, tarifs');
ok(/La Nuit Des Ombres/.test(r.data) && !/Welcome to Dominica/.test(r.data), 'uniquement les événements de SON organisation');
ok(/>3</.test(r.data) && /40,00/.test(r.data.replace(/&nbsp;| | /g, ' ')), 'billets et chiffre d’affaires : 3 billets, 40,00 €');
ok(/Standard/.test(r.data) && /Early/.test(r.data), 'répartition par tarif');
for (const p of ['7', '30', '90', 'all', 'piege', '../x']) { r = await owner.req(`/organisateur/analyse?periode=${encodeURIComponent(p)}`); ok(r.status === 200, `période « ${p} » : page saine (${r.status})`); }
r = await orgb.req('/organisateur/analyse'); const body = r.data.slice(r.data.indexOf('<main'), r.data.indexOf('</main>'));   // contenu de la page seulement (le site cite « La Nuit Des Ombres » dans sa description et son bandeau)
ok(/Welcome to Dominica/.test(body) && !/La Nuit Des Ombres/.test(body), 'l’autre organisation ne voit que ses chiffres');

section('Paiements : accès');
r = await anon.req('/organisateur/paiements'); ok(r.status >= 300 && r.status < 400, `sans connexion → connexion (${r.status})`);
for (const [n, c] of [['gestionnaire', mgr], ['staff', crew]]) { r = await c.req('/organisateur/paiements'); ok(r.status >= 300 && r.status < 400, `${n} → refusé (${r.status})`); }
r = await owner.req('/organisateur/paiements');
ok(r.status === 200 && /Compte non connecté/.test(r.data) && /Connecter Stripe/.test(r.data) && /Encaissements/.test(r.data), 'propriétaire : compte non connecté');
ok(/40,00/.test(r.data.replace(/&nbsp;| | /g, ' ')) && /La Nuit Des Ombres/.test(r.data) && !/Welcome to Dominica/.test(r.data), 'encaissements de son organisation seulement');
for (const kind of ['connect', 'sync', 'dashboard']) {
  const url = `/api/organisateur/paiements/${kind}`;
  r = await anon.req(url, { method: 'POST', body: { org: orgA } }); ok(r.status === 401, `${kind} : sans connexion → 401 (${r.status})`);
  r = await mgr.req(url, { method: 'POST', body: { org: orgA } }); ok(r.status === 403, `${kind} : gestionnaire → 403 (${r.status})`);
  r = await crew.req(url, { method: 'POST', body: { org: orgA } }); ok(r.status === 403, `${kind} : staff → 403 (${r.status})`);
  r = await orgb.req(url, { method: 'POST', body: { org: orgA } }); ok(r.status === 403, `${kind} : propriétaire d’une AUTRE organisation → 403 (${r.status})`);
  r = await owner.req(url, { method: 'POST', body: { org: 'pas-un-uuid' } }); ok(r.status === 400, `${kind} : corps invalide → 400 (${r.status})`);
}
ok((await one(`select stripe_account_id from public.organizers where id = $1`, [orgA])).stripe_account_id === '', 'aucun compte créé par les refus');

section('Inscription Stripe (faux Stripe)');
r = await owner.req('/api/organisateur/paiements/dashboard', { method: 'POST', body: { org: orgA } }); ok(r.status === 409, `tableau de bord Stripe avant activation → 409 (${r.status})`);
r = await owner.req('/api/organisateur/paiements/connect', { method: 'POST', body: { org: orgA } });
const acct = (await one(`select stripe_account_id, stripe_ready from public.organizers where id = $1`, [orgA]));
ok(r.status === 200 && /stripe\.mock\/onboard\/acct_/.test(r.data.url) && /^acct_/.test(acct.stripe_account_id) && !acct.stripe_ready, `lien d'inscription + compte créé (${r.data?.url})`);
const st1 = await L.stripeState();
const created = Object.values(st1.accounts)[0];
ok(created?.type === 'express' && created.country === 'FR' && created.email === 'themouv2.0971@gmail.com' || created?.type === 'express', 'compte Express créé côté Stripe');
r = await owner.req('/api/organisateur/paiements/connect', { method: 'POST', body: { org: orgA } });
ok(r.status === 200 && Object.keys((await L.stripeState()).accounts).length === 1, 'un second clic ne crée pas un second compte');
r = await owner.req('/organisateur/paiements'); ok(/Inscription à terminer/.test(r.data) && /Continuer l’inscription/.test(r.data), 'état : inscription à terminer');
r = await owner.req('/organisateur'); ok(/Connecter Stripe/.test(r.data), 'accueil : l’étape Stripe reste à faire');
await fetch(`${L.STRIPE}/__account?id=${acct.stripe_account_id}&ready=1`);
r = await owner.req('/api/organisateur/paiements/sync', { method: 'POST', body: { org: orgA } }); ok(r.status === 200 && r.data.status === 'ready', `synchronisation → prêt (${JSON.stringify(r.data)})`);
ok((await one(`select stripe_ready from public.organizers where id = $1`, [orgA])).stripe_ready === true, 'état « prêt » enregistré');
r = await owner.req('/organisateur/paiements'); ok(/Compte actif/.test(r.data) && /Ouvrir mon tableau de bord Stripe/.test(r.data) && !/Connecter Stripe/.test(r.data), 'état : compte actif');
r = await owner.req('/api/organisateur/paiements/dashboard', { method: 'POST', body: { org: orgA } }); ok(r.status === 200 && /stripe\.mock\/dashboard\//.test(r.data.url), 'lien vers le tableau de bord Stripe');
r = await owner.req('/organisateur'); ok(!/Connecter Stripe/.test(r.data), 'accueil : l’étape Stripe est cochée');
r = await admin.req('/api/organisateur/paiements/sync', { method: 'POST', body: { org: orgA } }); ok(r.status === 200, 'un admin peut synchroniser n’importe quelle organisation');
ok((await one(`select count(*)::int n from public.audit_log where action = 'organizer.stripe_update'`)).n === 2, 'création puis validation écrites dans audit_log');
const ver = await one(`select stripe_account_id from public.organizers where id = $1`, [orgA]);
ok(!(await owner.req('/organisateur')).data.includes(ver.stripe_account_id), 'l’identifiant du compte n’apparaît dans aucune page organisateur');

process.exit(L.summary('analyse et paiements') ? 1 : 0);
