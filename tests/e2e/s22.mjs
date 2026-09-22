// s22 — fonctions admin en plus (série 2, bloc 6, sous-ensemble retenu) : bandeau « Vous modifiez en tant qu'admin »,
// arrêt d'urgence (fermer/rouvrir les ventes, dépublier), recherche globale (code de billet, prénom acheteur),
// renommer un participant, annuler une commande complète.
import * as L from './lib.mjs';
const { ok, section, as, q, one, webhook, sessionCompleted, USERS } = L;
const SLUG = 'la-nuit-des-ombres';

await L.resetDb();
await q(`delete from public.admin_accounts`);
await q(`insert into public.admin_accounts (user_id, level, active, must_change_password, invitation_status) values ($1, 'super', true, false, 'sent')`, [USERS.admin.id]);
// pas de suppression des organisations non-défaut : d'autres scénarios en créent avec des lieux liés (clé étrangère RESTRICT).
await q(`delete from public.organizer_members where organizer_id = (select id from public.organizers where is_default)`);
const orgA = (await one(`select id from public.organizers where is_default`)).id;
await q(`insert into public.organizer_members (organizer_id, user_id, role) values ($1, $2, 'owner')`, [orgA, USERS.staff.id]);
const admin = await as(USERS.admin), staff = await as(USERS.staff), cust = await as(USERS.cust);
const tiers = await L.setupEvent(admin, { slug: SLUG });
const orderOf = (n) => one('select * from public.orders where order_number = $1', [n]);

section('Bandeau « Vous modifiez en tant qu’admin »');
let r = await admin.req(`/organisateur/evenements/${SLUG}`);
ok(r.status === 200 && /Vous modifiez en tant qu’admin/.test(r.data), 'bandeau présent pour un admin sur une organisation qui n’est pas la sienne');
r = await staff.req('/organisateur');
ok(r.status === 200 && !/Vous modifiez en tant qu’admin/.test(r.data), 'absent pour le propriétaire de l’organisation (staff = owner de THE MOUV dans ce banc)');

section('Arrêt d’urgence : fermer / rouvrir les ventes, dépublier');
r = await staff.req(`/api/billetterie/admin/events/${SLUG}/status`, { method: 'POST', body: { status: 'closed', reason: 'test' } });
ok(r.status === 401 || r.status === 403, `un organisateur (non admin) ne peut pas fermer les ventes (${r.status})`);
r = await admin.req(`/api/billetterie/admin/events/${SLUG}/status`, { method: 'POST', body: { status: 'closed', reason: 'ok' } });
ok(r.status === 400, `motif trop court → 400 (${r.status})`);
r = await admin.req(`/api/billetterie/admin/events/${SLUG}/status`, { method: 'POST', body: { status: 'closed', reason: 'Incident signalé par le staff : arrêt des ventes' } });
ok(r.status === 200 && r.data.status === 'closed', `fermeture (${r.status} ${JSON.stringify(r.data)})`);
r = await new L.Client().req(`/api/checkout`, { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.std, 1]]) });
ok(r.status === 401, 'client anonyme : 401 avant même le statut (pas de session) — la fermeture réelle est vérifiée ensuite via cust');
r = await cust.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.std, 1]]) });
ok(r.status === 409, `plus aucune vente possible pendant la fermeture (${r.status} ${r.data?.error ?? ''})`);
r = await admin.req(`/api/billetterie/admin/events/${SLUG}/status`, { method: 'POST', body: { status: 'published', reason: 'Incident résolu : réouverture des ventes' } });
ok(r.status === 200 && r.data.status === 'published', `réouverture (${r.status})`);
r = await cust.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.std, 1]]) });
ok(r.status === 200, `les ventes reprennent après réouverture (${r.status} ${r.data?.error ?? ''})`);
r = await admin.req(`/api/billetterie/admin/events/${SLUG}/status`, { method: 'POST', body: { status: 'draft', reason: 'Erreur de prix à corriger avant de revendre' } });
ok(r.status === 200 && r.data.status === 'draft', `dépublication (${r.status})`);
r = await admin.req(`/api/billetterie/admin/events/${SLUG}/status`, { method: 'POST', body: { status: 'published', reason: 'republier' } });
ok(r.status === 409 && /file/i.test(r.data.error), `republication directe refusée : passe par la file de validation (${r.status} « ${r.data.error} »)`);
r = await admin.req(`/api/billetterie/admin/events/${SLUG}/status`, { method: 'POST', body: { status: 'closed', reason: 'test' } });
ok(r.status === 200, `remise en place pour la suite du test (${r.status})`);
r = await admin.req(`/api/billetterie/admin/events/${SLUG}/status`, { method: 'POST', body: { status: 'published', reason: 'republier depuis fermé, autorisé' } });
ok(r.status === 200, `closed → published reste autorisé directement (${r.status})`);
r = await admin.req(`/api/billetterie/admin/events/inconnu-xyz/status`, { method: 'POST', body: { status: 'closed', reason: 'test' } });
ok(r.status === 404, `évènement inconnu → 404 (${r.status})`);
ok((await q(`select count(*)::int as n from public.audit_log where action = 'admin.event_status'`))[0].n >= 5, 'journalisé à chaque vrai changement');

section('Commande manuelle pour la suite (renommer, annuler)');
r = await cust.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.std, 2]]) });
ok(r.status === 200, `réservation (${r.status} ${r.data?.error ?? ''})`);
let order = await orderOf(r.data.order_number);
await webhook('checkout.session.completed', sessionCompleted(order));
order = await orderOf(order.order_number);
ok(order.status === 'paid', 'commande payée');
const tks = await q('select * from public.tickets where order_id = $1 order by id', [order.id]);
ok(tks.length === 2, `2 billets créés (${tks.length})`);

section('Recherche globale : code de billet, prénom acheteur');
r = await admin.req(`/api/admin-gestion/recherche?q=${encodeURIComponent(tks[0].code)}`);
ok(r.status === 200 && r.data.billets?.length === 1 && r.data.billets[0].order_id === order.id, `recherche par code de billet (${r.status} ${JSON.stringify(r.data.billets)})`);
r = await staff.req(`/api/admin-gestion/recherche?q=${encodeURIComponent(tks[0].code)}`);
ok(r.status === 401 || r.status === 403, `un organisateur ne fait pas de recherche globale admin (${r.status})`);
r = await admin.req(`/api/admin-gestion/recherche?q=${encodeURIComponent('Camille')}`);   // prénom réel du profil cust@test.local (fixture infra.mjs)
ok(r.status === 200 && r.data.orders?.some((o) => o.id === order.id), `recherche par prénom acheteur (${JSON.stringify(r.data.orders)})`);

section('Renommer un participant');
r = await staff.req(`/api/billetterie/admin/tickets/${tks[0].id}/rename`, { method: 'POST', body: { first_name: 'X', last_name: 'Y', reason: 'test' } });
ok(r.status === 401 || r.status === 403, `un organisateur ne renomme pas un billet via cette route admin (${r.status})`);
r = await admin.req(`/api/billetterie/admin/tickets/${tks[0].id}/rename`, { method: 'POST', body: { first_name: '', last_name: 'Y', reason: 'test suffisant' } });
ok(r.status === 400, `prénom vide → 400 (${r.status})`);
r = await admin.req(`/api/billetterie/admin/tickets/${tks[0].id}/rename`, { method: 'POST', body: { first_name: 'Camille2', last_name: 'Client2', reason: 'faute de frappe' } });
ok(r.status === 200, `renommage (${r.status} ${JSON.stringify(r.data)})`);
ok((await one('select holder_first_name, holder_last_name from public.tickets where id = $1', [tks[0].id])).holder_first_name === 'Camille2', 'nom mis à jour en base');
ok((await q(`select 1 from public.audit_log where action = 'admin.rename_participant'`)).length === 1, 'journalisé');

section('Annuler une commande complète');
r = await staff.req(`/api/billetterie/admin/orders/${order.id}/cancel`, { method: 'POST', body: { reason: 'test' } });
ok(r.status === 401 || r.status === 403, `un organisateur n’annule pas une commande via cette route admin (${r.status})`);
r = await admin.req(`/api/billetterie/admin/orders/${order.id}/cancel`, { method: 'POST', body: { reason: 'ok' } });
ok(r.status === 400, `motif trop court → 400 (${r.status})`);
r = await admin.req(`/api/billetterie/admin/orders/${order.id}/cancel`, { method: 'POST', body: { reason: 'Commande créée par erreur de test' } });
ok(r.status === 200 && r.data.status === 'cancelled' && r.data.tickets_cancelled === 2, `annulation (${r.status} ${JSON.stringify(r.data)})`);
ok((await one('select status from public.orders where id = $1', [order.id])).status === 'cancelled', 'commande annulée en base');
ok((await q(`select 1 from public.tickets where order_id = $1 and status = 'cancelled'`, [order.id])).length === 2, 'billets annulés en base');
r = await admin.req(`/api/billetterie/admin/orders/${order.id}/cancel`, { method: 'POST', body: { reason: 'nouvel essai' } });
ok(r.status === 200 && r.data.tickets_cancelled === 0, `idempotent (${r.status} ${JSON.stringify(r.data)})`);

process.exit(L.summary('fonctions admin en plus (série 2, bloc 6)') ? 1 : 0);
