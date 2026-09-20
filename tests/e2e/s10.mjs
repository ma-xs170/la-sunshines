// Interface de l'espace organisateur (banc local) : rôles (propriétaire / gestionnaire / staff), navigation, checklist, informations
// légales, archivage, tarifs (règles + audit), scan par le staff d'organisation, cloisonnement entre organisations.
import * as L from './lib.mjs';
const { ok, section, as, q, one, webhook, sessionCompleted, USERS } = L;
const A = 'la-nuit-des-ombres', B = 'welcome-to-dominica';
const cards = (html) => [...html.matchAll(/org-card__title"><a[^>]*>([^<]*)</g)].map((m) => m[1]);
const form = (o) => ({ raw: true, body: new URLSearchParams(o).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });

await L.resetDb();
await q(`truncate public.organizer_message_recipients, public.organizer_messages, public.organizer_members cascade`);
await q(`delete from public.organizers where not is_default`);
await q(`update public.organizers set contact_email = '', siret = '', address = '', responsible_name = '', stripe_ready = false, stripe_account_id = '' where is_default`);
const admin = await as(USERS.admin), owner = await as(USERS.staff), mgr = await as(USERS.cust), crew = await as(USERS.cust2), orgb = await as(USERS.orgb), anon = new L.Client();
const tiers = await L.setupEvent(admin);
await L.setupEvent(admin, { slug: B, tiers: [{ key: 's', name: 'Standard B', price_cents: 1200, quantity_total: 5, max_per_order: 5 }] });
const orgA = (await one(`select id from public.organizers where is_default`)).id;
const [{ id: orgB }] = await q(`insert into public.organizers (name, responsible_name, contact_email) values ('Autre Orga', 'Dupont Olivia', 'b@test.local') returning id`);
await q(`update public.ticketed_events set organizer_id = $1 where event_slug = $2`, [orgB, B]);
// owner = USERS.staff (profil « staff » du site, sans effet ici), mgr = USERS.cust, crew = USERS.cust2 (profil client), orgb = propriétaire de B
await q(`insert into public.organizer_members (organizer_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'manager'), ($1, $4, 'staff'), ($5, $6, 'owner')`, [orgA, USERS.staff.id, USERS.cust.id, USERS.cust2.id, orgB, USERS.orgb.id]);
const evA = (await one(`select id from public.ticketed_events where event_slug = $1`, [A])).id;
const buy = async (client, key, qty) => {
  const r = await client.req('/api/checkout', { method: 'POST', body: L.checkoutBody(A, [[tiers[key], qty]]) });
  if (r.status !== 200) throw new Error('checkout ' + JSON.stringify(r.data));
  await webhook('checkout.session.completed', sessionCompleted(await one('select * from public.orders where order_number = $1', [r.data.order_number])));
};
await buy(admin, 'std', 2);
const tk = await q(`select code from public.tickets where ticketed_event_id = $1 order by created_at`, [evA]);

section('Barre du haut selon le rôle');
const hrefs = (html) => ['/organisateur/participants', '/organisateur/analyse', '/organisateur/paiements', '/organisateur/actualites', '/organisateur/aide'].filter((h) => html.includes(`href="${h}"`));
let r = await owner.req('/organisateur');
ok(r.status === 200 && /Bienvenue/.test(r.data), 'propriétaire : accueil « Bienvenue »');
ok(hrefs(r.data).join() === '/organisateur/participants,/organisateur/analyse,/organisateur/paiements,/organisateur/actualites,/organisateur/aide', `propriétaire : Participants, Analyse, Paiements, Actualités, Aide (${hrefs(r.data)})`);
ok(!/Marketing/.test(r.data), 'aucune entrée « Marketing » vide');
r = await mgr.req('/organisateur');
ok(hrefs(r.data).join() === '/organisateur/participants,/organisateur/analyse,/organisateur/actualites,/organisateur/aide', `gestionnaire : pas de Paiements (${hrefs(r.data)})`);
r = await crew.req('/organisateur');
ok(hrefs(r.data).join() === '/organisateur/actualites,/organisateur/aide', `staff : ni Participants, ni Analyse, ni Paiements (${hrefs(r.data)})`);
ok(!/Créer un événement/.test(r.data) && !/Complétez votre compte/.test(r.data) && !/Revenus/.test(r.data), 'staff : ni création, ni checklist, ni revenus');
ok(/Scanner/.test(r.data) && !/Tableau de bord/.test(r.data), 'staff : bouton « Scanner » seulement');
for (const p of ['participants', 'analyse', 'paiements', 'parametres']) {
  r = await crew.req('/organisateur/' + p);
  ok(r.status >= 300 && r.status < 400, `staff : /organisateur/${p} refusé (${r.status})`);
}
for (const p of ['analyse', 'paiements', 'parametres']) {
  r = await mgr.req('/organisateur/' + p); const wantsRedirect = p !== 'analyse';
  ok(wantsRedirect ? r.status >= 300 && r.status < 400 : r.status === 200, `gestionnaire : /organisateur/${p} → ${r.status}`);
}

section('Checklist du compte');
r = await owner.req('/organisateur');
ok(/Complétez votre compte pour pouvoir publier/.test(r.data) && /Connecter Stripe/.test(r.data), 'propriétaire : checklist avec boutons');
ok((r.data.match(/org-check__step is-done"/g) ?? []).length === 0, 'aucune étape cochée au départ');
r = await mgr.req('/organisateur');
ok(/Complétez votre compte/.test(r.data) && /À faire par le propriétaire/.test(r.data) && !/Connecter Stripe/.test(r.data), 'gestionnaire : voit la checklist, sans pouvoir la remplir');

section('Informations légales (propriétaire seulement)');
const legal = { id: orgA, name: 'THE MOUV', legal_form: 'Association loi 1901', siret: '104 253 943 00013', responsible_name: '', address: '1 Morne Caruel, 97139 Les Abymes', contact_email: 'Orga@Test.Local' };
r = await mgr.req('/api/organisateur/organisation', { method: 'PUT', body: legal });   ok(r.status === 403, `gestionnaire → 403 (${r.status})`);
r = await crew.req('/api/organisateur/organisation', { method: 'PUT', body: legal });  ok(r.status === 403, `staff → 403 (${r.status})`);
r = await orgb.req('/api/organisateur/organisation', { method: 'PUT', body: legal });  ok(r.status === 403, `autre organisation → 403 (${r.status})`);
r = await anon.req('/api/organisateur/organisation', { method: 'PUT', body: legal });  ok(r.status === 401, `sans connexion → 401 (${r.status})`);
r = await owner.req('/api/organisateur/organisation', { method: 'PUT', body: { ...legal, siret: '123' } }); ok(r.status === 400 && /14 chiffres/.test(r.data.error), `SIRET invalide → 400 (${r.data?.error})`);
r = await owner.req('/api/organisateur/organisation', { method: 'PUT', body: { ...legal, contact_email: 'pas-un-email' } }); ok(r.status === 400, `email invalide → 400 (${r.status})`);
r = await owner.req('/api/organisateur/organisation', { method: 'PUT', body: legal }); ok(r.status === 200, `propriétaire → 200 (${r.status})`);
const o1 = await one(`select * from public.organizers where id = $1`, [orgA]);
ok(o1.siret === '10425394300013' && o1.contact_email === 'orga@test.local' && o1.address.startsWith('1 Morne'), 'les informations alimentent la fiche organisateur (billet PDF)');
ok((await one(`select count(*)::int n from public.audit_log where action = 'organizer.legal_update' and actor_id = $1`, [USERS.staff.id])).n === 1, 'modification écrite dans audit_log');
r = await owner.req('/organisateur');
ok((r.data.match(/org-check__step is-done"/g) ?? []).length === 2 && /Compte de paiement Stripe/.test(r.data), 'checklist : informations légales et email cochés, Stripe restant');
await q(`update public.organizers set stripe_ready = true, stripe_account_id = 'acct_test123456' where id = $1`, [orgA]);
r = await owner.req('/organisateur'); ok(!/Complétez votre compte/.test(r.data), 'tout est fait : la checklist disparaît');
r = await owner.req('/organisateur/parametres'); ok(r.status === 200 && /Informations légales/.test(r.data) && /Adresse d’envoi des emails/.test(r.data), 'page de paramètres du propriétaire');

section('Archivage');
r = await crew.req(`/api/organisateur/events/${A}/archive`, { method: 'POST', body: { archived: true } }); ok(r.status === 403, `staff → 403 (${r.status})`);
r = await orgb.req(`/api/organisateur/events/${A}/archive`, { method: 'POST', body: { archived: true } }); ok(r.status === 403, `autre organisation → 403 (${r.status})`);
r = await mgr.req(`/api/organisateur/events/${A}/archive`, { method: 'POST', body: { archived: 'oui' } }); ok(r.status === 400, `corps invalide → 400 (${r.status})`);
r = await mgr.req(`/api/organisateur/events/${A}/archive`, { method: 'POST', body: { archived: true } }); ok(r.status === 200, `gestionnaire → 200 (${r.status})`);
r = await owner.req('/organisateur'); ok(cards(r.data).length === 0 && /Aucun résultat/.test(r.data), 'un événement archivé quitte l’onglet « À venir »');
ok(/org-tab__n">1</.test(r.data), 'et compte dans « Archives »');
r = await mgr.req(`/api/organisateur/events/${A}/archive`, { method: 'POST', body: { archived: false } }); ok(r.status === 200, 'désarchivage');
r = await owner.req('/organisateur'); ok(cards(r.data).join() === 'La Nuit Des Ombres', 'l’événement est de retour');
ok((await one(`select count(*)::int n from public.audit_log where action in ('organizer.event_archive','organizer.event_unarchive')`)).n === 2, 'archivage et désarchivage écrits dans audit_log');

section('Tarifs : règles et audit');
const url = `/api/organisateur/events/${A}/tiers`;
const tier = (o) => ({ id: null, name: 'VIP', description: '', price_cents: 2500, quantity_total: 8, max_per_order: 4, sales_start: null, sales_end: null, is_active: true, sort_order: 3, ...o });
r = await crew.req(url, { method: 'PUT', body: tier() }); ok(r.status === 403, `staff : création refusée (${r.status})`);
r = await crew.req(url); ok(r.status === 403, `staff : lecture des tarifs refusée (${r.status})`);
r = await orgb.req(url, { method: 'PUT', body: tier() }); ok(r.status === 403, `autre organisation → 403 (${r.status})`);
r = await anon.req(url, { method: 'PUT', body: tier() }); ok(r.status === 401, `sans connexion → 401 (${r.status})`);
r = await mgr.req(url, { method: 'PUT', body: tier({ price_cents: 49 }) }); ok(r.status === 400 && /0,50/.test(r.data.error), `prix < 0,50 € refusé (${r.data?.error})`);
r = await mgr.req(url, { method: 'PUT', body: tier({ name: '' }) }); ok(r.status === 400, `nom vide refusé (${r.status})`);
r = await mgr.req(url, { method: 'PUT', body: tier() }); const vip = r.data?.id; ok(r.status === 200 && vip, `gestionnaire : création (${r.status})`);
r = await mgr.req(url, { method: 'PUT', body: tier({ name: 'vip' }) }); ok(r.status === 409, `nom déjà pris → 409 (${r.status})`);
r = await mgr.req(url, { method: 'PUT', body: tier({ id: tiers.std, name: 'Standard', price_cents: 1500, quantity_total: 1 }) });
ok(r.status === 409 && /au moins 2/.test(r.data.error), `quantité sous les billets vendus → 409 (${r.data?.error})`);
r = await mgr.req(url, { method: 'PUT', body: tier({ id: tiers.std, name: 'Standard', price_cents: 1800, quantity_total: 2 }) }); ok(r.status === 200, 'quantité = vendus, prix modifié : accepté');
r = await mgr.req(url); ok(r.status === 200 && r.data.tiers.find((t) => t.id === tiers.std)?.price_cents === 1800 && r.data.consumed >= 2, 'lecture des tarifs à jour');
r = await crew.req(`${url}/${vip}`, { method: 'DELETE' }); ok(r.status === 403, `staff : suppression refusée (${r.status})`);
r = await orgb.req(`${url}/${vip}`, { method: 'DELETE' }); ok(r.status === 403, `autre organisation : suppression refusée (${r.status})`);
r = await mgr.req(`${url}/${tiers.std}`, { method: 'DELETE' }); ok(r.status === 200 && r.data.result === 'archived', `tarif vendu : archivé, jamais supprimé (${r.data?.result})`);
ok((await one(`select count(*)::int n from public.ticket_tiers where id = $1 and archived_at is not null`, [tiers.std])).n === 1, 'le tarif vendu existe toujours (archivé)');
r = await mgr.req(`${url}/${vip}`, { method: 'DELETE' }); ok(r.status === 200 && r.data.result === 'deleted', 'tarif jamais vendu : supprimé');
r = await mgr.req(url, { method: 'PUT', body: tier({ id: tiers.std, name: 'Standard', quantity_total: 5 }) }); ok(r.status === 409, `tarif archivé non modifiable → 409 (${r.status})`);
const au = await q(`select action, meta->>'via' via from public.audit_log where action like 'tier.%' and actor_id = $1 order by id`, [USERS.cust.id]);
ok(au.map((a) => a.action).join() === 'tier.create,tier.update,tier.archive,tier.delete' && au.every((a) => a.via === 'organizer'), `tarifs journalisés : ${au.map((a) => a.action)}`);
r = await mgr.req(`/organisateur/evenements/${A}?onglet=tarifs`);
ok(r.status === 200 && /Créer un tarif/.test(r.data) && /Archivé/.test(r.data), 'onglet Tarifs (gestionnaire)');

section('Tableau de bord : onglets et staff');
r = await mgr.req(`/organisateur/evenements/${A}`);
ok(/Billets vendus/.test(r.data) && /Participants/.test(r.data) && /href="\?onglet=scan#onglets"/.test(r.data) && /href="\?onglet=tarifs#onglets"/.test(r.data), 'gestionnaire : chiffres clés + onglets Participants / Tarifs / Scan');
r = await mgr.req(`/organisateur/evenements/${A}?onglet=scan`); ok(r.status === 200 && /Scan à l’entrée/.test(r.data), 'onglet Scan (gestionnaire)');
r = await crew.req(`/organisateur/evenements/${A}`);
ok(r.status === 200 && /Scan à l’entrée/.test(r.data) && !/Billets vendus/.test(r.data) && !/cust@test\.local/.test(r.data) && !/Chiffre d’affaires/.test(r.data), 'staff : uniquement le scan (aucun chiffre, aucun participant)');
r = await crew.req(`/organisateur/evenements/${A}?onglet=tarifs`); ok(!/Créer un tarif/.test(r.data), 'staff : l’onglet Tarifs lui reste fermé');
r = await crew.req(`/organisateur/evenements/${B}`); ok(r.status === 404, `staff : l’événement d’une autre organisation → 404 (${r.status})`);
r = await crew.req(`/api/organisateur/events/${A}/export`); ok(r.status === 403, `staff : export refusé (${r.status})`);
const aud0 = (await one(`select count(*)::int n from public.audit_log where action = 'organizer.participants_view'`)).n;
r = await mgr.req(`/organisateur/evenements/${A}?onglet=tarifs`);
ok((await one(`select count(*)::int n from public.audit_log where action = 'organizer.participants_view'`)).n === aud0, 'l’onglet Tarifs ne consulte pas (et ne journalise pas) les participants');
r = await owner.req(`/organisateur/evenements/${A}`);   // (le journal dédoublonne 5 min par personne : on prend quelqu'un qui n'a pas encore consulté)
ok((await one(`select count(*)::int n from public.audit_log where action = 'organizer.participants_view'`)).n === aud0 + 1, 'l’onglet Participants journalise la consultation');

section('Scan par le staff d’organisation');
r = await anon.req('/api/scan', { method: 'POST', body: { code: tk[0].code, event_id: evA } }); ok(r.status === 401, `sans connexion → 401 (${r.status})`);
r = await orgb.req('/api/scan', { method: 'POST', body: { code: tk[0].code, event_id: evA } }); ok(r.status === 403, `membre d’une AUTRE organisation → 403 (${r.status})`);
r = await orgb.req(`/api/scan/stats?event_id=${evA}`); ok(r.status === 403, `compteur : autre organisation → 403 (${r.status})`);
r = await crew.req('/api/scan', { method: 'POST', body: { code: tk[0].code, event_id: evA } }); ok(r.status === 200 && r.data.result === 'valid', `staff d’organisation : billet valide (${r.data?.result})`);
r = await crew.req('/api/scan', { method: 'POST', body: { code: tk[0].code, event_id: evA } }); ok(r.data.result === 'already_used', 'second scan : déjà scanné');
r = await crew.req(`/api/scan/stats?event_id=${evA}`); ok(r.status === 200 && r.data.entered === 1 && r.data.sold === 2, `compteur en direct (${JSON.stringify(r.data)})`);
r = await crew.req(`/api/scan/stats?event_id=${(await one(`select id from public.ticketed_events where event_slug = $1`, [B])).id}`); ok(r.status === 403, `compteur d’un autre événement → 403 (${r.status})`);
r = await mgr.req('/api/scan', { method: 'POST', body: { code: tk[1].code, event_id: evA } }); ok(r.status === 200 && r.data.result === 'valid', 'gestionnaire : peut aussi scanner');

section('Sélecteur d’organisation');
await q(`insert into public.organizer_members (organizer_id, user_id, role) values ($1, $2, 'manager')`, [orgB, USERS.staff.id]);
r = await owner.req('/organisateur'); ok(cards(r.data).join() === 'La Nuit Des Ombres' && /THE MOUV/.test(r.data), 'organisation courante par défaut : THE MOUV');
r = await owner.req('/api/organisateur/org', { method: 'POST', ...form({ id: orgB, next: `/organisateur/evenements/${A}` }) });
ok(r.status === 303 && new URL(r.headers.get('location')).pathname === '/organisateur', `changement d’organisation depuis une fiche → retour à l’accueil (${r.headers.get('location')})`);
r = await owner.req('/organisateur'); ok(cards(r.data).join() === 'Welcome to Dominica', `il voit maintenant l’autre organisation (${cards(r.data)})`);
r = await owner.req('/organisateur/paiements'); ok(r.status >= 300 && r.status < 400, `rôle gestionnaire dans B : Paiements refusé (${r.status})`);

process.exit(L.summary('interface de l’espace organisateur') ? 1 : 0);
