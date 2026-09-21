// s16 — code promo au paiement : remise calculée côté serveur, montant Stripe = total en base, billets et e-mail après paiement,
// remboursement de la commande remisée, refus (inconnu, épuisé, tarif non visé), commande libérée en cas de refus.
import * as L from './lib.mjs';
import crypto from 'crypto';
const { ok, section, as, q, one, webhook, sessionCompleted, stripeState, mailState, USERS } = L;
const SLUG = 'la-nuit-des-ombres';

await L.resetDb();
const admin = await as(USERS.admin), cust = await as(USERS.cust), cust2 = await as(USERS.cust2);
const tiers = await L.setupEvent(admin);   // std 15,00 € (max 4 par commande) …
const ev = await one(`select id from public.ticketed_events where event_slug = $1`, [SLUG]);
await q(`insert into public.promo_codes (ticketed_event_id, code, kind, value, max_uses) values ($1, 'PROMO20', 'percent', 20, 1), ($1, 'PROMOFIXE', 'fixed', 300, null), ($1, 'GRATUIT', 'percent', 100, null)`, [ev.id]);
const orderOf = (n) => one('select * from public.orders where order_number = $1', [n]);

section('Achat avec un code promo (carte 4242, faux Stripe)');
let r = await cust.req('/api/checkout', { method: 'POST', body: { ...L.checkoutBody(SLUG, [[tiers.std, 2]]), promo_code: 'promo20' } });
ok(r.status === 200 && /^http/.test(r.data.url), `checkout accepté avec le code (minuscules acceptées) (${r.status} ${r.data?.error ?? ''})`);
let order = await orderOf(r.data.order_number);
ok(order.subtotal_cents === 2400 && order.discount_cents === 600 && order.total_cents === 2400 && order.promo_code_id, `2 × 15,00 € − 20 % = 24,00 € (remise 6,00 €) : sous-total ${order.subtotal_cents}, remise ${order.discount_cents}`);
const item = await one('select * from public.order_items where order_id = $1', [order.id]);
ok(item.unit_price_cents === 1200, `prix unitaire de la ligne = 12,00 € (${item.unit_price_cents})`);
const sess = Object.values((await stripeState()).sessions).at(-1);
ok(sess.amount_total === 2400 && sess.lines[0].unit === 1200 && sess.lines[0].qty === 2, `Stripe reçoit 2 × 12,00 € : ${JSON.stringify(sess.lines)}`);
const m0 = (await mailState()).sent.length;
const wh = await webhook('checkout.session.completed', sessionCompleted(order));
order = await orderOf(order.order_number);
ok(wh.status === 200 && order.status === 'paid', `paiement confirmé par webhook (${wh.status}, ${order.status})`);
ok((await q(`select 1 from public.tickets where order_id = $1 and status = 'valid'`, [order.id])).length === 2, '2 billets QR créés');
let waited = 0; while ((await mailState()).sent.length === m0 && waited++ < 40) await new Promise((x) => setTimeout(x, 150));
ok((await mailState()).sent.length > m0, 'e-mail de billets envoyé');
ok((await one(`select used_count from public.promo_codes where code = 'PROMO20'`)).used_count === 1, 'utilisations du code : 1');

section('Scan du billet remisé');
const t = await one(`select code from public.tickets where order_id = $1 limit 1`, [order.id]);
const scanner = await as(USERS.staff);
r = await scanner.req('/api/scan', { method: 'POST', body: { code: t.code, event_id: ev.id } });
ok(r.status === 200 && r.data.result === 'valid', `scan du billet remisé : VALIDE (${r.status} ${r.data?.result})`);

section('Refus : la commande n’est jamais facturée avec un mauvais code');
const pendingBefore = (await one(`select count(*)::int n from public.orders where status = 'pending'`)).n;
for (const [code, who, label] of [['NOPE123', cust2, 'code inconnu'], ['PROMO20', cust2, 'code épuisé (1 utilisation max)'], ['GRATUIT', cust2, 'code qui rendrait la commande gratuite']]) {
  r = await who.req('/api/checkout', { method: 'POST', body: { ...L.checkoutBody(SLUG, [[tiers.std, 1]]), promo_code: code } });
  ok(r.status >= 400 && r.status < 500 && /code/i.test(r.data.error), `${label} refusé (${r.status}) « ${r.data?.error} »`);
}
ok((await one(`select count(*)::int n from public.orders where status = 'pending'`)).n === pendingBefore, 'aucune réservation ne reste en attente après un refus');
r = await cust2.req('/api/checkout', { method: 'POST', body: { ...L.checkoutBody(SLUG, [[tiers.std, 1]]), promo_code: '<script>' } });
ok(r.status === 400, `code au format invalide → 400 (${r.status})`);

section('Montant fixe et remboursement d’une commande remisée');
r = await cust2.req('/api/checkout', { method: 'POST', body: { ...L.checkoutBody(SLUG, [[tiers.std, 1]]), promo_code: 'PROMOFIXE' } });
ok(r.status === 200, `code fixe accepté (${r.status})`);
let o2 = await orderOf(r.data.order_number);
ok(o2.subtotal_cents === 1200 && o2.discount_cents === 300, `15,00 € − 3,00 € = 12,00 € (${o2.subtotal_cents})`);
await webhook('checkout.session.completed', sessionCompleted(o2));
o2 = await orderOf(o2.order_number);
r = await admin.req(`/api/billetterie/admin/orders/${o2.id}/refund`, { method: 'POST', body: { request_id: crypto.randomUUID(), amount_cents: 1200 } });
o2 = await orderOf(o2.order_number);
const refunds = (await stripeState()).refunds;
ok(r.status === 200 && refunds.at(-1)?.amount === 1200 && ['refunded', 'partially_refunded'].includes(o2.status), `remboursement du montant réellement payé (${refunds.at(-1)?.amount}) — statut ${o2.status} (${r.status})`);
process.exit(L.summary('code promo au paiement') ? 1 : 0);
