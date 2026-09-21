// s13 — tarifs GRATUITS (0 €) : jamais de Stripe, billets + e-mail immédiats, panier mixte, anti-abus.
import * as L from './lib.mjs';
const { ok, section, as, q, one, stripeState, mailState, USERS } = L;
const SLUG = 'la-nuit-des-ombres';

await L.resetDb();
const admin = await as(USERS.admin), cust = await as(USERS.cust), cust2 = await as(USERS.cust2);
const tiers = await L.setupEvent(admin, { tiers: [
  { key: 'free', name: 'Gratuit', price_cents: 0, quantity_total: 4, max_per_order: 2, max_per_account: 3 },
  { key: 'std', name: 'Standard', price_cents: 1500, quantity_total: 10, max_per_order: 4 },
] });
const orderOf = (n) => one('select * from public.orders where order_number = $1', [n]);
const sessions = async () => Object.keys((await stripeState()).sessions).length;

section('Formulaire de tarif : 0 accepté, 0,01–0,49 refusé, négatif refusé');
const tierBody = (price) => ({ id: null, name: 'T' + price, description: '', sales_start: null, sales_end: null, is_active: true, sort_order: 0, price_cents: price, quantity_total: 5, max_per_order: 2 });
let r = await admin.req(`/api/billetterie/admin/events/${SLUG}/tiers`, { method: 'PUT', body: tierBody(0) });
ok(r.status === 200, `prix 0 accepté (${r.status})`);
r = await admin.req(`/api/billetterie/admin/events/${SLUG}/tiers`, { method: 'PUT', body: tierBody(30) });
ok(r.status === 400 && /Stripe/.test(r.data.error), `prix 0,30 € refusé avec un message clair : « ${r.data.error} »`);
r = await admin.req(`/api/billetterie/admin/events/${SLUG}/tiers`, { method: 'PUT', body: tierBody(-100) });
ok(r.status === 400, `prix négatif refusé (${r.status})`);
r = await admin.req(`/api/billetterie/admin/events/${SLUG}/tiers`, { method: 'PUT', body: tierBody(50) });
ok(r.status === 200, `0,50 € accepté (${r.status})`);

section('Achat 100 % gratuit : aucune session Stripe, billets immédiats');
await admin.req('/api/billetterie/admin/settings', { method: 'PATCH', body: { key: 'fee_percent', value: 10 } });
await admin.req('/api/billetterie/admin/settings', { method: 'PATCH', body: { key: 'fee_fixed_cents', value: 50 } });
const s0 = await sessions(), m0 = (await mailState()).sent.length;
r = await cust.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.free, 2]]) });
ok(r.status === 200 && r.data.free === true && /succes\?order=SUN-/.test(r.data.redirect), `réservation gratuite OK → ${r.data?.redirect}`);
let o = await orderOf(r.data.order_number);
ok(o.status === 'paid' && o.total_cents === 0 && o.fee_cents === 0 && !o.stripe_payment_intent_id && !o.stripe_checkout_session_id, `commande payée à 0 €, 0 frais malgré 10 % + 0,50 €, sans Stripe (${o.status}/${o.total_cents}/${o.fee_cents})`);
ok((await sessions()) === s0 && (await stripeState()).refunds.length === 0, 'AUCUNE session Stripe créée');
ok((await q('select 1 from public.tickets where order_id = $1 and status = \'valid\'', [o.id])).length === 2, '2 billets QR créés');
const mails = (await mailState()).sent;
ok(mails.length === m0 + 1, `e-mail de billets envoyé (${mails.length - m0})`);
ok((await orderOf(o.order_number)).email_status === 'sent', 'statut e-mail = sent');

section('Anti-abus');
r = await cust.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.free, 2]]) });
ok(r.status === 409 && /maximum/.test(r.data.error), `plafond par compte (3) dépassé → 409 « ${r.data.error} »`);
r = await cust.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.free, 3]]) });
ok(r.status === 400, `plafond par commande (2) dépassé → 400 (${r.data.error})`);
await q(`update auth.users set email_confirmed_at = null where id = $1`, [USERS.cust2.id]);
r = await cust2.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.free, 1]]) });
ok(r.status === 403 && /e-mail/.test(r.data.error), `e-mail non confirmé → 403 « ${r.data.error} »`);
await q(`update auth.users set email_confirmed_at = now() where id = $1`, [USERS.cust2.id]);
r = await L.as(USERS.cust2).then((c) => c.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.free, 2]]) }));
ok(r.status === 200 && r.data.free, 'compte confirmé : 2 billets restants réservés');
r = await cust.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.free, 1]]) });
ok(r.status === 409 && /places/.test(r.data.error), `stock épuisé (4 − 2 − 2) : plus de billet gratuit → 409 « ${r.data.error} »`);
ok((await one(`select count(*)::int as n from public.tickets where tier_id = $1`, [tiers.free])).n === 4, 'aucun billet au-delà du stock');

section('Panier mixte : Stripe n\'encaisse que la partie payante');
await q(`update public.ticket_tiers set quantity_total = 20 where id = $1`, [tiers.free]);
await q(`update public.ticket_tiers set max_per_account = 20 where id = $1`, [tiers.free]);
r = await cust2.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.free, 1], [tiers.std, 2]]) });
ok(r.status === 200 && /^http/.test(r.data.url), `panier mixte → session Stripe (${r.status})`);
o = await orderOf(r.data.order_number);
const sess = Object.values((await stripeState()).sessions).at(-1);
ok(o.subtotal_cents === 3000 && o.fee_cents === 350 && o.total_cents === 3350, `sous-total 30,00 €, frais 3,50 € (10 % + 0,50 € sur le payant), total ${o.total_cents}`);
ok(sess.lines.length === 2 && sess.lines.every((l) => l.unit > 0) && sess.amount_total === 3350, `Stripe : aucune ligne à 0 € (${JSON.stringify(sess.lines)})`);
const wh = await L.webhook('checkout.session.completed', L.sessionCompleted(o));
ok(wh.status === 200 && (await q('select 1 from public.tickets where order_id = $1', [o.id])).length === 3, 'après paiement : 3 billets (1 gratuit + 2 payants)');

section('Remboursement : commande gratuite ignorée (aucun appel Stripe)');
const freeOrder = await one(`select id from public.orders where total_cents = 0 and status = 'paid' limit 1`);
const refunds0 = (await stripeState()).refunds.length;
r = await admin.req(`/api/billetterie/admin/orders/${freeOrder.id}/refund`, { method: 'POST', body: { request_id: crypto.randomUUID(), reason: 'test', cancel_ticket_ids: [] } });
ok(r.status === 409 && /gratuite/.test(r.data.error) && (await stripeState()).refunds.length === refunds0, `refus « ${r.data.error} », 0 appel Stripe`);

section('Finance : commandes gratuites ignorées');
const fin = await one(`select coalesce(sum(total_cents),0)::int as gross from public.orders where total_cents > 0 and status in ('paid','partially_refunded','refunded')`);
ok(fin.gross === 3350, `recette brute = uniquement le payant (${fin.gross})`);

process.exit(L.summary('tarifs gratuits'));
