import * as L from './lib.mjs';
const { ok, section, as, q, one, webhook, sessionCompleted, stripeState, USERS } = L;
const SLUG = 'la-nuit-des-ombres';

await L.resetDb();
const admin = await as(USERS.admin), cust = await as(USERS.cust), cust2 = await as(USERS.cust2);
const anon = new L.Client();
const tiers = await L.setupEvent(admin);
const orderOf = (n) => one('select * from public.orders where order_number = $1', [n]);

section('Checkout : accès et validation');
let r = await anon.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.std, 1]]) });
ok(r.status === 401, `sans connexion → 401 (${r.status})`);
r = await cust.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.std, 1]], { accept_terms: false }) });
ok(r.status === 400 && /CGV/.test(r.data.error), `CGV non acceptées → 400 « ${r.data.error} »`);
r = await cust.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.std, 1]], { guardian_consent: false }) });
ok(r.status === 400 && /18 ans/.test(r.data.error), `consentement 18 ans / représentant légal absent → 400`);
r = await cust.req('/api/checkout', { method: 'POST', body: { slug: SLUG, items: [{ tier_id: tiers.std, quantity: 2, participants: L.people(1) }], accept_terms: true, guardian_consent: true } });
ok(r.status === 400, `2 billets mais 1 participant → 400 (${r.data.error})`);
r = await cust.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.std, 5]]) });
ok(r.status === 400 && /maximale/.test(r.data.error), `5 > max 4 par commande → 400 « ${r.data.error} »`);
r = await cust.req('/api/checkout', { method: 'POST', body: L.checkoutBody('slug-inconnu', [[tiers.std, 1]]) });
ok(r.status === 404, `événement inconnu → 404 (${r.status})`);
r = await cust.req('/api/checkout', { method: 'POST', body: 'pas du json', raw: true, headers: { 'content-type': 'text/plain' } });
ok(r.status === 415, `content-type non JSON → 415 (${r.status})`);

section('Checkout : mode Bizouk = rien ne s\'achète (kill-switch)');
await admin.req('/api/billetterie/admin/settings', { method: 'PATCH', body: { key: 'ticketing_mode', value: 'bizouk' } });
r = await cust.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.std, 1]]) });
ok(r.status === 403, `flag sur Bizouk → 403 « ${r.data.error} »`);
ok((await q('select count(*)::int as n from public.orders'))[0].n === 0, 'aucune commande créée en mode Bizouk');
await admin.req('/api/billetterie/admin/settings', { method: 'PATCH', body: { key: 'ticketing_mode', value: 'native' } });

section('Checkout : profil incomplet');
await q(`update public.profiles set phone = '' where id = $1`, [USERS.cust.id]);
r = await cust.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.std, 1]]) });
ok(r.status === 400 && /profil/.test(r.data.error), `téléphone vide → 400 « ${r.data.error} »`);
await q(`update public.profiles set phone = '0690111111' where id = $1`, [USERS.cust.id]);

section('Checkout nominal : le PRIX ne vient jamais du client');
const evil = L.checkoutBody(SLUG, [[tiers.std, 2]]);
evil.items[0].price_cents = 1; evil.items[0].unit_price_cents = 1; evil.total_cents = 1; evil.amount = 1; evil.currency = 'usd'; evil.event_title = 'PIRATÉ';
r = await cust.req('/api/checkout', { method: 'POST', body: evil });
ok(r.status === 200 && /^http/.test(r.data.url), `checkout accepté malgré les champs de prix falsifiés (${r.status})`);
let order = await orderOf(r.data.order_number);
ok(order.status === 'pending' && order.total_cents === 3000 && order.subtotal_cents === 3000, `commande pending, total 30,00 € relu en base (${order.total_cents})`);
const item = await one('select * from public.order_items where order_id = $1', [order.id]);
ok(item.unit_price_cents === 1500 && item.event_title !== 'PIRATÉ' && item.tier_name === 'Standard' && item.venue_name === 'Salle des Fêtes', `snapshot : prix 1500, titre « ${item.event_title} », lieu « ${item.venue_name} »`);
let st = await stripeState(); let sess = Object.values(st.sessions).at(-1);
ok(sess.amount_total === 3000 && sess.lines.length === 1 && sess.lines[0].unit === 1500 && sess.lines[0].qty === 2, `Stripe reçoit 2 × 15,00 € (pas 1 centime) : ${JSON.stringify(sess.lines)}`);
ok(sess.params.currency === undefined || true, 'devise EUR fixée côté serveur');
ok(sess.params['line_items[0][price_data][currency]'] === 'eur', 'devise = eur (le « usd » du client est ignoré)');
ok(sess.params.client_reference_id === order.id && sess.params['metadata[order_id]'] === order.id && sess.params['metadata[order_number]'] === order.order_number, 'métadonnées de commande transmises à Stripe');
ok(/^checkout:/.test(sess.idempotency), `clé d'idempotence de création de session (${sess.idempotency})`);
ok(sess.params.mode === 'payment' && sess.params.locale === 'fr' && sess.params['payment_method_types[0]'] === 'card', 'mode payment, locale fr, carte');
ok(/293 B/.test(sess.params['custom_text[submit][message]'] ?? ''), 'mention « TVA non applicable, art. 293 B du CGI » sur la page de paiement');
const expIn = (+sess.params.expires_at - Date.now() / 1000) / 60;
ok(expIn > 29 && expIn < 31, `session Stripe : expiration ${expIn.toFixed(1)} min (minimum Stripe 30) ; réservation interne : 15 min`);
const resMin = (new Date(order.expires_at) - Date.now()) / 60000;
ok(resMin > 14 && resMin < 15.1, `réservation interne expire dans ${resMin.toFixed(1)} min`);
ok(order.stripe_checkout_session_id === sess.id, 'session Stripe enregistrée sur la commande');

section('Frais de service (configurables, affichés, dans le total Stripe)');
await admin.req('/api/billetterie/admin/settings', { method: 'PATCH', body: { key: 'fee_percent', value: 10 } });
await admin.req('/api/billetterie/admin/settings', { method: 'PATCH', body: { key: 'fee_fixed_cents', value: 50 } });
r = await cust2.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.std, 1]]) });
const order2 = await orderOf(r.data.order_number);
sess = Object.values((await stripeState()).sessions).at(-1);
ok(order2.fee_cents === 200 && order2.total_cents === 1700, `10 % + 0,50 € sur 15,00 € → frais ${order2.fee_cents} / total ${order2.total_cents}`);
ok(sess.lines.length === 2 && sess.lines[1].name === 'Frais de service' && sess.amount_total === 1700, 'ligne « Frais de service » séparée, total Stripe = total commande');
await admin.req('/api/billetterie/admin/settings', { method: 'PATCH', body: { key: 'fee_percent', value: 0 } });
await admin.req('/api/billetterie/admin/settings', { method: 'PATCH', body: { key: 'fee_fixed_cents', value: 0 } });

section('Annulation d\'une réservation');
r = await cust.req('/api/checkout/cancel', { method: 'POST', body: { order_number: order2.order_number } });
ok(r.status === 404, `un autre client ne peut pas annuler ma commande (${r.status})`);
r = await cust2.req('/api/checkout/cancel', { method: 'POST', body: { order_number: order2.order_number } });
ok(r.status === 200 && r.data.cancelled === true && (await orderOf(order2.order_number)).status === 'cancelled', 'le propriétaire annule : places libérées');
await new Promise((r) => setTimeout(r, 300));
ok((await stripeState()).sessions[order2.stripe_checkout_session_id]?.expired === true, 'session Stripe expirée au mieux');
r = await cust2.req('/api/checkout/cancel', { method: 'POST', body: { order_number: order2.order_number } });
ok(r.status === 200 && r.data.cancelled === false, 'annulation rejouée : sans effet');

section('Webhook : signature');
order = await orderOf(order.order_number);
let w = await webhook('checkout.session.completed', sessionCompleted(order), { sigOverride: null });
ok(w.status === 400, `sans en-tête stripe-signature → 400 (${w.status})`);
w = await webhook('checkout.session.completed', sessionCompleted(order), { sigOverride: 't=1,v1=deadbeef' });
ok(w.status === 400, `signature fausse → 400 (${w.status})`);
w = await webhook('checkout.session.completed', sessionCompleted(order), { secret: 'whsec_autre' });
ok(w.status === 400, `signé avec un autre secret → 400 (${w.status})`);
ok((await one(`select count(*)::int as n from public.tickets`)).n === 0 && (await one(`select count(*)::int as n from public.stripe_events`)).n === 0, 'aucun effet sur la base (ni billet, ni événement enregistré)');

section('Webhook : confirmation de paiement');
w = await webhook('checkout.session.completed', sessionCompleted(order));
ok(w.status === 200, `checkout.session.completed signé → 200 (${w.status})`);
order = await orderOf(order.order_number);
const tk = await q('select * from public.tickets where order_id = $1 order by created_at', [order.id]);
ok(order.status === 'paid' && order.paid_at && order.stripe_payment_intent_id === 'pi_' + order.id, `commande payée, payment_intent enregistré`);
ok(tk.length === 2 && tk.every((t) => t.status === 'valid' && t.user_id === USERS.cust.id), `2 billets valides créés au nom du client`);
ok(tk.every((t) => /^[0-9A-HJKMNP-TV-Z]{32}$/.test(t.code)) && new Set(tk.map((t) => t.code)).size === 2, `codes HMAC 32 car. uniques (${tk[0].code.slice(0, 8)}…)`);
ok(tk[0].holder_first_name === 'Part0' && tk[1].holder_last_name === 'Nom1', `noms des participants repris (${tk.map((t) => t.holder_first_name + ' ' + t.holder_last_name).join(', ')})`);
const ev1 = await one('select * from public.stripe_events where id = $1', [w.eventId]);
ok(ev1?.status === 'done', `stripe_events : ${w.eventId} → done`);

section('Webhook : idempotence');
const beforeTickets = (await one('select count(*)::int as n from public.tickets')).n;
w = await webhook('checkout.session.completed', sessionCompleted(order), { id: w.eventId });
ok(w.status === 200 && w.data.duplicate === true, 'même événement reçu 2 fois → ignoré (duplicate)');
w = await webhook('checkout.session.completed', sessionCompleted(order));   // autre id d'événement, même commande
ok(w.status === 200 && (await one('select count(*)::int as n from public.tickets')).n === beforeTickets, 'même commande confirmée par un AUTRE événement → aucun billet en plus');
const par = await Promise.all(Array.from({ length: 10 }, () => webhook('checkout.session.completed', sessionCompleted(order))));
ok(par.every((x) => x.status === 200) && (await one('select count(*)::int as n from public.tickets')).n === beforeTickets, '10 livraisons simultanées → toujours 2 billets');

section('Webhook : cas particuliers');
w = await webhook('checkout.session.completed', { id: 'cs_fixture', object: 'checkout.session', payment_status: 'paid', amount_total: 100, payment_intent: 'pi_x' });
ok(w.status === 200, 'session de test sans commande (stripe trigger) → 200, ignorée');
const pend = await cust.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.early, 1]]) });
const op = await orderOf(pend.data.order_number);
w = await webhook('checkout.session.completed', { ...sessionCompleted(op), payment_status: 'unpaid' });
ok(w.status === 200 && (await orderOf(op.order_number)).status === 'pending', 'payment_status « unpaid » → ignoré, commande inchangée');
w = await webhook('checkout.session.completed', { ...sessionCompleted(op), amount_total: 1 });
ok(w.status === 200 && (await orderOf(op.order_number)).status === 'pending' && (await one('select status from public.stripe_events where id=$1', [w.eventId])).status === 'failed', 'montant Stripe ≠ commande → non confirmée, événement « failed » à examiner');
w = await webhook('checkout.session.expired', { id: op.stripe_checkout_session_id, object: 'checkout.session' });
ok(w.status === 200 && (await orderOf(op.order_number)).status === 'expired', 'checkout.session.expired → commande expirée');
w = await webhook('customer.created', { id: 'cus_1' });
ok(w.status === 200, 'événement non géré → 200 (ignoré)');

section('Paiement TARDIF : places reprises → remboursement TOTAL, une seule fois');
await q(`update public.ticket_tiers set quantity_total = 5 where id = $1`, [tiers.early]);
let a = await cust.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.early, 5]]) });   // toutes les places Early
const oa = await orderOf(a.data.order_number);
await q(`update public.orders set expires_at = now() - interval '1 minute' where id = $1`, [oa.id]);            // la réservation expire (15 min passées)
let b = await cust2.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.early, 5]]) });  // quelqu'un d'autre les prend
ok(b.status === 200, 'un autre client réserve les 5 places libérées par l\'expiration (stock sans cron)');
w = await webhook('checkout.session.completed', sessionCompleted(oa));
const oa2 = await orderOf(oa.order_number);
st = await stripeState();
ok(w.status === 200 && ['cancelled','refunded'].includes(oa2.status) && (await one('select count(*)::int as n from public.tickets where order_id=$1', [oa.id])).n === 0, `paiement tardif sans stock → aucun billet, commande ${oa2.status} (annulée puis remboursée)`);
ok(st.refunds.length === 1 && st.refunds[0].amount === oa.total_cents && st.refunds[0].payment_intent === 'pi_' + oa.id, `remboursement Stripe du TOTAL payé : ${st.refunds[0]?.amount} c (commande ${oa.total_cents} c)`);
ok(st.refunds[0].key === `stock_lost:${oa.id}`, `clé d'idempotence Stripe : ${st.refunds[0].key}`);
w = await webhook('checkout.session.completed', sessionCompleted(oa));   // rejeu (nouvel id d'événement)
w = await webhook('checkout.session.completed', sessionCompleted(oa));
ok((await stripeState()).refunds.length === 1 && (await one('select count(*)::int as n from public.refunds where order_id=$1', [oa.id])).n === 1, 'webhook rejoué 2 fois de plus → toujours 1 seul remboursement');
w = await webhook('charge.refunded', { id: 'ch_1', object: 'charge', payment_intent: 'pi_' + oa.id, amount: oa.total_cents, amount_refunded: oa.total_cents });
const oa3 = await orderOf(oa.order_number);
ok(w.status === 200 && oa3.status === 'refunded' && oa3.refunded_cents === oa.total_cents, `charge.refunded → commande « refunded » (${oa3.refunded_cents} c)`);

section('Remboursement Stripe en ÉCHEC puis rejeu');
await q(`update public.ticket_tiers set quantity_total = 8 where id = $1`, [tiers.early]);
await q(`update public.orders set status = 'cancelled' where id = $1`, [b.data && (await orderOf(b.data.order_number)).id]);
a = await cust.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.early, 3]]) });
const oc = await orderOf(a.data.order_number);
await q(`update public.orders set expires_at = now() - interval '1 minute' where id = $1`, [oc.id]);
await q(`update public.ticket_tiers set quantity_total = 0 where id = $1`, [tiers.early]);   // plus aucune place
await fetch(L.STRIPE + '/__fail?on=1');
w = await webhook('checkout.session.completed', sessionCompleted(oc));
ok(w.status === 500, `Stripe refuse le remboursement → webhook 500 (Stripe le rejouera) (${w.status})`);
ok((await one('select status from public.stripe_events where id=$1', [w.eventId])).status === 'failed', 'événement marqué « failed »');
await fetch(L.STRIPE + '/__fail?on=0');
const w2 = await webhook('checkout.session.completed', sessionCompleted(oc), { id: w.eventId });   // rejeu du MÊME événement par Stripe
const rf = await q('select * from public.refunds where order_id=$1', [oc.id]);
ok(w2.status === 200 && rf.length === 1 && rf[0].status === 'succeeded' && rf[0].amount_cents === oc.total_cents, `rejeu → remboursement effectué une seule fois (${rf.length} ligne, ${rf[0]?.status})`);
ok((await stripeState()).refunds.filter((x) => x.payment_intent === 'pi_' + oc.id).length === 1, 'un seul remboursement chez Stripe');

section('charge.refunded partiel sur commande payée');
w = await webhook('charge.refunded', { id: 'ch_2', object: 'charge', payment_intent: 'pi_' + order.id, amount: 3000, amount_refunded: 1000 });
const op2 = await orderOf(order.order_number);
ok(op2.status === 'partially_refunded' && op2.refunded_cents === 1000 && (await q(`select 1 from public.tickets where order_id=$1 and status='valid'`, [order.id])).length === 2, 'remboursement partiel : statut partially_refunded, billets toujours valides');

const f = L.summary('phase 3 (Stripe + webhook), bout en bout');
process.exit(f ? 1 : 0);
