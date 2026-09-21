import * as L from './lib.mjs';
import { createRequire } from 'module';
const { ok, section, as, q, one, webhook, sessionCompleted, stripeState, mailState, USERS } = L;
const SLUG = 'la-nuit-des-ombres', SLUG2 = 'edition-picasso';

await L.resetDb();
const admin = await as(USERS.admin), staff = await as(USERS.staff), cust = await as(USERS.cust), cust2 = await as(USERS.cust2), anon = new L.Client();
const tiers = await L.setupEvent(admin);
const ids2 = await L.setupEvent(admin, { slug: SLUG2, tiers: [{ key: 's', name: 'Autre soirée', price_cents: 1200, quantity_total: 5, max_per_order: 5 }] });
const evId = (await one('select id from public.ticketed_events where event_slug = $1', [SLUG])).id;
const ev2Id = (await one('select id from public.ticketed_events where event_slug = $1', [SLUG2])).id;
const orderOf = (n) => one('select * from public.orders where order_number = $1', [n]);
async function buyAndPay(client, key, qty, names) {
  const body = L.checkoutBody(SLUG, [[tiers[key], qty]]); if (names) body.items[0].participants = names;
  const r = await client.req('/api/checkout', { method: 'POST', body });
  const o = await orderOf(r.data.order_number);
  await webhook('checkout.session.completed', sessionCompleted(o));
  return orderOf(o.order_number);
}
const evil = [{ first_name: '=HYPERLINK("http://evil.example","clic")', last_name: 'Formule' }, { first_name: 'Bob', last_name: 'Deux' }, { first_name: 'Cléo', last_name: 'Trois' }];
const oA = await buyAndPay(cust, 'std', 3, evil);            // 3 × 15 €
const oB = await buyAndPay(cust2, 'early', 1);               // 1 × 10 €
const tA = await q('select * from public.tickets where order_id = $1 order by created_at', [oA.id]);
const tB = (await q('select * from public.tickets where order_id = $1', [oB.id]))[0];

section('Accès : admin uniquement, mot de passe /admin insuffisant');
for (const [name, c, expect] of [['anonyme', anon, 401], ['client', cust, 403], ['staff', staff, 403], ['admin', admin, 200]]) {
  const r = await c.req('/api/billetterie/admin/orders'); ok(r.status === expect, `GET commandes en tant que ${name} → ${r.status} (attendu ${expect})`);
}
let r = await new L.Client().req('/api/billetterie/admin/orders', { headers: { cookie: L.legacyAdminCookie() } });
ok(r.status === 401, `cookie /admin historique seul (mot de passe) → ${r.status} : aucun accès à la billetterie`);
r = await new L.Client().req('/admin/billetterie', { headers: { cookie: L.legacyAdminCookie() } });
ok(r.status === 307 && /connexion/.test(r.headers.get('location')), `page /admin/billetterie avec le seul mot de passe → redirection connexion`);

section('Liste des commandes : filtres et recherche');
r = await admin.req('/api/billetterie/admin/orders');
ok(r.data.total === 2 && r.data.orders.length === 2, `2 commandes (${r.data.total})`);
r = await admin.req('/api/billetterie/admin/orders?status=paid&event=' + SLUG); ok(r.data.total === 2, 'filtre statut + événement');
r = await admin.req('/api/billetterie/admin/orders?event=' + SLUG2); ok(r.data.total === 0, 'filtre événement sans commande → 0');
r = await admin.req('/api/billetterie/admin/orders?status=refunded'); ok(r.data.total === 0, 'filtre statut refunded → 0');
r = await admin.req('/api/billetterie/admin/orders?q=cust2@'); ok(r.data.total === 1 && r.data.orders[0].order_number === oB.order_number, 'recherche par email');
r = await admin.req('/api/billetterie/admin/orders?q=Camille'); ok(r.data.total === 1 && r.data.orders[0].id === oA.id, 'recherche par prénom');
r = await admin.req('/api/billetterie/admin/orders?q=' + oB.order_number); ok(r.data.total === 1, 'recherche par numéro de commande');
r = await admin.req('/api/billetterie/admin/orders?q=' + encodeURIComponent('x%,status.eq.paid)')); ok(r.status === 400, `syntaxe de filtre injectée → 400 (${r.status})`);
r = await admin.req('/api/billetterie/admin/orders?status=hack'); ok(r.status === 400, 'statut inconnu → 400');
r = await admin.req(`/api/billetterie/admin/orders/${oA.id}`); ok(r.status === 200 && r.data.tickets.length === 3, 'détail : 3 billets');
r = await cust.req(`/api/billetterie/admin/orders/${oA.id}`); ok(r.status === 403, 'détail refusé à un client');

section('Renvoi de l\'email de billets');
let mails = (await mailState()).sent.length;
r = await admin.req(`/api/billetterie/admin/orders/${oA.id}/resend`, { method: 'POST' });
ok(r.status === 200 && (await mailState()).sent.length === mails + 1, 'admin renvoie l\'email (malgré statut « sent »)');
ok((await orderOf(oA.order_number)).email_attempts === 2, 'tentatives = 2');
r = await cust.req(`/api/billetterie/admin/orders/${oA.id}/resend`, { method: 'POST' }); ok(r.status === 403, 'renvoi refusé à un client');
await fetch(L.MAIL + '/__fail?on=1');
r = await admin.req(`/api/billetterie/admin/orders/${oA.id}/resend`, { method: 'POST' });
ok(r.status === 502 && /domain/i.test(r.data.error) && (await orderOf(oA.order_number)).email_status === 'failed', `Resend en échec → 502 + statut « failed » + erreur affichée`);
await fetch(L.MAIL + '/__fail?on=0');
r = await admin.req(`/api/billetterie/admin/orders/${oA.id}/resend`, { method: 'POST' }); ok(r.status === 200 && (await orderOf(oA.order_number)).email_status === 'sent', 'renvoi réussi → « sent »');

section('Scan à l\'entrée');
const codeOf = (t) => t.code;
r = await anon.req('/api/scan', { method: 'POST', body: { code: codeOf(tA[0]), event_id: evId } }); ok(r.status === 401, `scan sans connexion → ${r.status}`);
r = await cust.req('/api/scan', { method: 'POST', body: { code: codeOf(tA[0]), event_id: evId } }); ok(r.status === 403, `scan par un CLIENT → ${r.status}`);
ok((await one('select status from public.tickets where id = $1', [tA[0].id])).status === 'valid', 'le billet n\'a pas été consommé par un client');
r = await staff.req('/api/scan', { method: 'POST', body: { code: codeOf(tA[0]), event_id: evId } });
ok(r.status === 200 && r.data.result === 'valid' && r.data.tier === 'Standard' && /Formule/.test(r.data.holder), `staff : VALIDE (${r.data.holder} · ${r.data.tier})`);
const firstAt = r.data.used_at;
r = await staff.req('/api/scan', { method: 'POST', body: { code: codeOf(tA[0]), event_id: evId } });
ok(r.data.result === 'already_used' && r.data.used_at === firstAt, `2e scan : DÉJÀ SCANNÉ, heure du 1er scan conservée (${r.data.used_at})`);
r = await admin.req('/api/scan', { method: 'POST', body: { code: codeOf(tA[0]), event_id: evId } }); ok(r.data.result === 'already_used', 'un admin peut aussi scanner (déjà scanné)');
const tampered = codeOf(tA[1]).slice(0, 10) + (codeOf(tA[1])[10] === 'A' ? 'B' : 'A') + codeOf(tA[1]).slice(11);
r = await staff.req('/api/scan', { method: 'POST', body: { code: tampered, event_id: evId } });
ok(r.data.result === 'invalid', 'code falsifié (signature HMAC fausse) → INVALIDE');
ok((await one('select status from public.tickets where id = $1', [tA[1].id])).status === 'valid', 'et le vrai billet n\'est pas consommé');
r = await staff.req('/api/scan', { method: 'POST', body: { code: 'A'.repeat(32), event_id: evId } }); ok(r.data.result === 'invalid', 'code inventé → INVALIDE');
r = await staff.req('/api/scan', { method: 'POST', body: { code: 'n\'importe quoi', event_id: evId } }); ok(r.data.result === 'invalid', 'texte quelconque → INVALIDE');
r = await staff.req('/api/scan', { method: 'POST', body: { code: codeOf(tB), event_id: ev2Id } }); ok(r.data.result === 'wrong_event', 'billet d\'un AUTRE événement → refusé (wrong_event)');
ok((await one('select status from public.tickets where id = $1', [tB.id])).status === 'valid', 'le billet d\'un autre événement n\'est pas consommé');
const manual = codeOf(tA[1]).match(/.{1,4}/g).join('-').toLowerCase();
r = await staff.req('/api/scan', { method: 'POST', body: { code: '  ' + manual + ' ', event_id: evId } });
ok(r.data.result === 'valid', `saisie manuelle en minuscules avec tirets et espaces → VALIDE (${manual.slice(0, 14)}…)`);
r = await staff.req('/api/scan', { method: 'POST', body: { code: codeOf(tA[2]), event_id: 'pas-un-uuid' } }); ok(r.status === 400, 'event_id invalide → 400');
r = await staff.req('/api/scan', { method: 'POST', body: { code: codeOf(tA[2]) } }); ok(r.status === 400, 'event_id manquant → 400');
r = await staff.req(`/api/scan/stats?event_id=${evId}`); ok(r.data.entered === 2 && r.data.sold === 4, `compteur : ${r.data.entered} entrés / ${r.data.sold} vendus (3 billets + 1 autre commande)`);
r = await cust.req(`/api/scan/stats?event_id=${evId}`); ok(r.status === 403, 'compteur refusé à un client');
const burst = await Promise.all(Array.from({ length: 20 }, () => staff.req('/api/scan', { method: 'POST', body: { code: codeOf(tA[2]), event_id: evId } })));
const bt = burst.reduce((m, x) => ((m[x.data.result] = (m[x.data.result] || 0) + 1), m), {});
ok(bt.valid === 1 && bt.already_used === 19, `20 scans HTTP simultanés du même billet : ${JSON.stringify(bt)}`);
r = await staff.req(`/api/scan/stats?event_id=${evId}`); ok(r.data.entered === 3 && r.data.sold === 4, `compteur final ${r.data.entered} / ${r.data.sold}`);

section('Page /admin/scan');
r = await staff.req('/admin/scan'); ok(r.status === 200 && /Nuit Des Ombres/i.test(r.data), 'staff : page de scan avec l\'événement');
r = await admin.req('/admin/scan'); ok(r.status === 200, 'admin : page de scan');
r = await cust.req('/admin/scan'); ok(r.status === 403 && /Accès refusé/.test(r.data) && !/scan__video|scan__bar/.test(r.data), 'client : « Accès refusé », écran de scan absent');
r = await anon.req('/admin/scan'); ok(r.status === 307, 'anonyme : redirection connexion');
r = await staff.req('/admin/billetterie'); ok(r.status === 403 && /Accès refusé/.test(r.data), 'staff n\'accède PAS à l\'admin billetterie');

section('Annulation d\'un billet');
const oC = await buyAndPay(cust, 'std', 2);
const tC = await q('select * from public.tickets where order_id = $1 order by created_at', [oC.id]);
const availBefore = (await (await fetch(L.BASE + `/api/billetterie/${SLUG}/disponibilite`)).json()).tiers.find((t) => t.id === tiers.std).remaining;
r = await cust.req(`/api/billetterie/admin/tickets/${tC[0].id}/cancel`, { method: 'POST' }); ok(r.status === 403, 'annulation refusée à un client');
r = await admin.req(`/api/billetterie/admin/tickets/${tC[0].id}/cancel`, { method: 'POST' }); ok(r.status === 200 && r.data.status === 'cancelled', 'admin annule un billet');
const availAfter = (await (await fetch(L.BASE + `/api/billetterie/${SLUG}/disponibilite`)).json()).tiers.find((t) => t.id === tiers.std).remaining;
ok(availAfter === availBefore + 1, `la place est libérée (${availBefore} → ${availAfter})`);
r = await staff.req('/api/scan', { method: 'POST', body: { code: tC[0].code, event_id: evId } }); ok(r.data.result === 'cancelled', 'scanner un billet annulé → refusé (cancelled)');
r = await admin.req(`/api/billetterie/admin/tickets/${tA[0].id}/cancel`, { method: 'POST' }); ok(r.status === 409, `billet déjà scanné : annulation refusée (${r.status})`);

section('Remboursements admin (Stripe)');
const rid = crypto.randomUUID();
r = await cust.req(`/api/billetterie/admin/orders/${oC.id}/refund`, { method: 'POST', body: { request_id: rid, amount_cents: 500 } }); ok(r.status === 403, 'remboursement refusé à un client');
r = await staff.req(`/api/billetterie/admin/orders/${oC.id}/refund`, { method: 'POST', body: { request_id: rid, amount_cents: 500 } }); ok(r.status === 403, 'remboursement refusé au staff');
r = await admin.req(`/api/billetterie/admin/orders/${oC.id}/refund`, { method: 'POST', body: { amount_cents: 500 } }); ok(r.status === 400, 'sans request_id → 400');
r = await admin.req(`/api/billetterie/admin/orders/${oC.id}/refund`, { method: 'POST', body: { request_id: rid, amount_cents: 500, cancel_ticket_ids: [tA[1].id] } }); ok(r.status === 400, 'billet d\'une AUTRE commande → 400');
const st0 = (await stripeState()).refunds.length;
r = await admin.req(`/api/billetterie/admin/orders/${oC.id}/refund`, { method: 'POST', body: { request_id: rid, amount_cents: 1000, reason: 'Geste commercial', cancel_ticket_ids: [tC[1].id] } });
let st = await stripeState();
ok(r.status === 200 && st.refunds.length === st0 + 1 && st.refunds.at(-1).amount === 1000 && st.refunds.at(-1).payment_intent === oC.stripe_payment_intent_id, `remboursement PARTIEL de 10,00 € envoyé à Stripe (${r.status})`);
ok(st.refunds.at(-1).key === `admin:${rid}`, `clé d'idempotence : ${st.refunds.at(-1).key}`);
let oc = await orderOf(oC.order_number);
ok(oc.status === 'partially_refunded' && oc.refunded_cents === 1000 && (await one('select status from public.tickets where id=$1', [tC[1].id])).status === 'cancelled', 'commande partially_refunded, billet choisi annulé');
r = await admin.req(`/api/billetterie/admin/orders/${oC.id}/refund`, { method: 'POST', body: { request_id: rid, amount_cents: 1000, reason: 'Geste commercial' } });
ok((await stripeState()).refunds.length === st0 + 1 && (await q('select 1 from public.refunds where order_id=$1', [oC.id])).length === 1, 'double clic (même request_id) → UN seul remboursement');
r = await admin.req(`/api/billetterie/admin/orders/${oC.id}/refund`, { method: 'POST', body: { request_id: crypto.randomUUID(), amount_cents: 999999 } }); ok(r.status === 400 || r.status === 409, `montant supérieur au restant refusé (${r.status})`);
r = await admin.req(`/api/billetterie/admin/orders/${oC.id}/refund`, { method: 'POST', body: { request_id: crypto.randomUUID(), amount_cents: 2001 } }); ok(r.status === 409, `> reste remboursable (2000) → 409 « ${r.data.error} »`);
await fetch(L.STRIPE + '/__fail?on=1');
r = await admin.req(`/api/billetterie/admin/orders/${oC.id}/refund`, { method: 'POST', body: { request_id: crypto.randomUUID(), amount_cents: 500 } });
ok(r.status === 502, `Stripe refuse → 502 « ${r.data.error?.slice(0, 50)} »`);
await fetch(L.STRIPE + '/__fail?on=0');
oc = await orderOf(oC.order_number);
ok(oc.refunded_cents === 1000 && oc.status === 'partially_refunded', 'échec Stripe : rien n\'est décompté');
r = await admin.req(`/api/billetterie/admin/orders/${oC.id}/refund`, { method: 'POST', body: { request_id: crypto.randomUUID() } });
oc = await orderOf(oC.order_number);
ok(r.status === 200 && oc.status === 'refunded' && oc.refunded_cents === oc.total_cents, `remboursement du TOTAL restant → commande « refunded » (${oc.refunded_cents}/${oc.total_cents})`);
ok((await q(`select 1 from public.tickets where order_id=$1 and status='valid'`, [oC.id])).length === 0, 'plus aucun billet valide sur la commande remboursée');
r = await admin.req(`/api/billetterie/admin/orders/${oC.id}/refund`, { method: 'POST', body: { request_id: crypto.randomUUID(), amount_cents: 100 } }); ok(r.status === 409, `commande déjà intégralement remboursée → 409`);
// billet scanné : reste « used » après remboursement total
const oD = await buyAndPay(cust, 'std', 1); const tD = await one('select * from public.tickets where order_id=$1', [oD.id]);
await staff.req('/api/scan', { method: 'POST', body: { code: tD.code, event_id: evId } });
r = await admin.req(`/api/billetterie/admin/orders/${oD.id}/refund`, { method: 'POST', body: { request_id: crypto.randomUUID() } });
ok(r.status === 200 && (await one('select status from public.tickets where id=$1', [tD.id])).status === 'used', 'billet déjà scanné : reste « Entré » après un remboursement total');
// non payée
const pendRes = await cust.req('/api/checkout', { method: 'POST', body: L.checkoutBody(SLUG, [[tiers.early, 1]]) });
const oP = await orderOf(pendRes.data.order_number);
r = await admin.req(`/api/billetterie/admin/orders/${oP.id}/refund`, { method: 'POST', body: { request_id: crypto.randomUUID() } }); ok(r.status === 409, 'commande non payée : remboursement refusé (409)');

section('Remboursement fait depuis le DASHBOARD Stripe');
await webhook('charge.refunded', { id: 'ch_d', object: 'charge', payment_intent: oB.stripe_payment_intent_id, amount: oB.total_cents, amount_refunded: oB.total_cents });
const ob = await orderOf(oB.order_number);
ok(ob.status === 'refunded' && ob.refunded_cents === oB.total_cents, 'commande alignée sur Stripe (« refunded »)');
ok((await one('select status from public.tickets where id=$1', [tB.id])).status === 'refunded', 'billet passé « refunded »');
ok((await q(`select * from public.refunds where order_id=$1 and source='stripe_dashboard'`, [oB.id])).length === 1, 'ligne de remboursement « stripe_dashboard » créée');
r = await staff.req('/api/scan', { method: 'POST', body: { code: tB.code, event_id: ev2Id } }); ok(r.data.result === 'wrong_event' || r.data.result === 'cancelled', 'ce billet ne passe plus');

section('Invitations (billets sans paiement)');
mails = (await mailState()).sent.length;
const invBody = { slug: SLUG, tier_id: tiers.std, guests: [{ email: USERS.cust2.email, first_name: 'Invitée', last_name: 'Spéciale', quantity: 2 }, { email: 'externe@test.local', first_name: 'Ext', last_name: 'Erne', quantity: 1 }] };
r = await cust.req('/api/billetterie/admin/invitations', { method: 'POST', body: invBody }); ok(r.status === 403, 'invitations refusées à un client');
r = await staff.req('/api/billetterie/admin/invitations', { method: 'POST', body: invBody }); ok(r.status === 403, 'invitations refusées au staff');
r = await admin.req('/api/billetterie/admin/invitations', { method: 'POST', body: { ...invBody, guests: [{ email: 'pas-un-email', first_name: 'A', last_name: 'B' }] } }); ok(r.status === 400, 'email invalide → 400');
r = await admin.req('/api/billetterie/admin/invitations', { method: 'POST', body: invBody });
ok(r.status === 200 && r.data.results.length === 2 && r.data.results.every((x) => x.ok && x.email_status === 'sent'), `2 invitations créées et emails envoyés (${JSON.stringify(r.data.results.map((x) => x.email_status))})`);
ok((await mailState()).sent.length === mails + 2, '2 emails d\'invitation');
const inv = await q(`select * from public.orders where source = 'manual' order by created_at`);
ok(inv.length === 2 && inv.every((o) => o.status === 'paid' && o.total_cents === 0), 'commandes « manuelles » payées à 0 €');
ok(inv[0].user_id === USERS.cust2.id && inv[1].user_id === null, 'billets rattachés au compte existant, sinon sans compte');
r = await cust2.req('/compte/billets'); ok(r.status === 200 && /Spéciale/.test(r.data), 'l\'invitée voit ses billets dans « Mes billets »');
const invT = await one(`select * from public.tickets where order_id = $1 limit 1`, [inv[0].id]);
r = await staff.req('/api/scan', { method: 'POST', body: { code: invT.code, event_id: evId } }); ok(r.data.result === 'valid', 'billet d\'invitation scannable à l\'entrée');
await q(`update public.ticket_tiers set quantity_total = (select count(*) from public.tickets where tier_id=$1 and status in ('valid','used')) + 1 where id=$1`, [tiers.std]);
r = await admin.req('/api/billetterie/admin/invitations', { method: 'POST', body: { ...invBody, guests: [{ email: 'trop@test.local', first_name: 'T', last_name: 'P', quantity: 3 }] } });
ok(r.status === 200 && r.data.results[0].ok === false && /places/.test(r.data.results[0].error), `plus de stock : invitation refusée (« ${r.data.results[0].error} »)`);

section('Statistiques');
r = await admin.req(`/api/billetterie/admin/events/${SLUG}/stats`);
const dbSold = (await one(`select count(*)::int as n from public.tickets where ticketed_event_id=$1 and status in ('valid','used')`, [evId])).n;
const dbRev = (await one(`select coalesce(sum(total_cents - refunded_cents),0)::int as n from public.orders where event_slug=$1 and source='web' and status in ('paid','partially_refunded','refunded')`, [SLUG])).n;
ok(r.status === 200 && r.data.sold === dbSold && r.data.revenue_cents === dbRev, `vendus ${r.data.sold} (base ${dbSold}), CA net ${r.data.revenue_cents} c (base ${dbRev})`);
ok(r.data.invitations === 3 && r.data.tiers.length === 2 && r.data.fill_rate > 0, `invitations : ${r.data.invitations}, remplissage ${r.data.fill_rate} %`);
r = await staff.req(`/api/billetterie/admin/events/${SLUG}/stats`); ok(r.status === 403, 'statistiques refusées au staff');

section('Exports CSV');
r = await cust.req(`/api/billetterie/admin/export/participants?event=${SLUG}`); ok(r.status === 403, 'export refusé à un client');
r = await staff.req(`/api/billetterie/admin/export/participants?event=${SLUG}`); ok(r.status === 403, 'export refusé au staff');
r = await admin.req(`/api/billetterie/admin/export/participants?event=${SLUG}`);
ok(r.status === 200 && /text\/csv/.test(r.headers.get('content-type')) && /attachment; filename="participants-/.test(r.headers.get('content-disposition')), 'CSV participants : en-têtes de téléchargement');
const rawCsv = Buffer.from(await (await fetch(L.BASE + `/api/billetterie/admin/export/participants?event=${SLUG}`, { headers: { cookie: admin.cookieHeader() } })).arrayBuffer());
ok(rawCsv[0] === 0xEF && rawCsv[1] === 0xBB && rawCsv[2] === 0xBF && r.data.split('\r\n')[0].includes('Prénom'), 'BOM UTF-8 (octets EF BB BF) + en-têtes français (Excel)');
const allCodes = (await q('select code from public.tickets')).map((x) => x.code);
ok(!allCodes.some((c) => r.data.includes(c)), 'AUCUN code de billet dans l\'export');
ok(r.data.includes("'=HYPERLINK") && !/(^|;)"?=HYPERLINK/m.test(r.data), 'injection de formule neutralisée (\'=HYPERLINK…)');
ok(r.data.includes('Invitation') && r.data.includes('Entré'), 'origine « Invitation » et statut « Entré » présents');
r = await admin.req(`/api/billetterie/admin/export/orders?event=${SLUG}`);
ok(r.status === 200 && r.data.includes(oA.order_number) && /Total \(€\)/.test(r.data) && r.data.includes('45,00'), 'CSV commandes : montants en euros');
r = await admin.req(`/api/billetterie/admin/export/orders?event=slug-inconnu`); ok(r.status === 404, 'événement inconnu → 404');

section('Journal d\'audit (billetterie uniquement)');
const actions = (await q('select distinct action from public.audit_log')).map((x) => x.action);
for (const a of ['refund.create', 'ticket.cancel', 'invitation.create', 'export.participants', 'export.orders', 'order.resend_email', 'event.create', 'tier.create', 'setting.update']) ok(actions.includes(a), `audit : ${a}`);
ok((await q('select 1 from public.audit_log where actor_id is null and action like $1', ['refund%'])).length === 0, 'les actions admin portent l\'identité de l\'acteur');

section('Pages admin de billetterie');
for (const p of ['/admin/billetterie', '/admin/billetterie/commandes', `/admin/billetterie/commandes/${oA.id}`, '/admin/billetterie/invitations']) {
  const a = await admin.req(p), c = await cust.req(p), n = await anon.req(p);
  ok(a.status === 200 && c.status === 403 && /Accès refusé/.test(c.data) && n.status === 307, `${p} : admin OK · client « Accès refusé » · anonyme → connexion (admin ${a.status}, client ${c.status}, anonyme ${n.status})`);
}

section('RLS à travers le vrai PostgREST (JWT clients, sans passer par l\'application)');
const jC = L.userJwt(USERS.cust), jS = L.userJwt(USERS.staff), jA = L.userJwt(USERS.admin);
let x = await L.rest('/orders?select=id,buyer_email', { token: jC });
ok(x.status === 200 && x.data.length > 0 && x.data.every((o) => o.buyer_email === USERS.cust.email), `client : ne lit que SES commandes (${x.data.length})`);
x = await L.rest('/tickets?select=id,user_id', { token: jC }); ok(x.data.every((t) => t.user_id === USERS.cust.id), 'client : ne lit que SES billets');
x = await L.rest('/orders?select=id', { token: L.ANON_KEY }); ok(x.status === 401 || x.status === 403 || (x.data?.code === '42501'), `anonyme : commandes illisibles (${x.status})`);
x = await L.rest('/orders?select=id', { token: jS }); ok(x.status === 200 && x.data.length === 0, 'staff : aucune commande lisible');
x = await L.rest('/orders?select=id', { token: jA }); ok(x.data.length === (await one('select count(*)::int as n from public.orders')).n, `admin : lit TOUTES les commandes (${x.data.length})`);
x = await L.rest(`/orders?id=eq.${oA.id}`, { method: 'PATCH', token: jC, body: { status: 'refunded' } }); ok(x.status >= 400, `client : PATCH commande refusé (${x.status})`);
x = await L.rest(`/tickets?id=eq.${tA[1].id}`, { method: 'PATCH', token: jC, body: { status: 'used' } }); ok(x.status >= 400, `client : PATCH billet refusé (${x.status})`);
x = await L.rest('/orders', { method: 'POST', token: jC, body: { ticketed_event_id: evId, event_slug: SLUG, buyer_email: 'x@y.fr' } }); ok(x.status >= 400, `client : INSERT commande refusé (${x.status})`);
x = await L.rest('/ticket_tiers?select=id', { method: 'POST', token: jA, body: { name: 'x' } }); ok(x.status >= 400, `même un admin ne peut pas écrire directement (${x.status})`);
for (const [fn, tok, body] of [['reserve_tickets', jC, { p_slug: SLUG, p_user: USERS.cust.id, p_event_title: 't', p_items: [], p_buyer: {}, p_fee_percent: 0, p_fee_fixed_cents: 0, p_terms_version: 'v', p_guardian_consent: true }], ['fulfill_order', L.ANON_KEY, { p_order: oA.id, p_session: 's', p_pi: 'p', p_amount: 1, p_tickets: [] }], ['scan_ticket', jS, { p_code: tA[0].code, p_event: evId, p_scanner: USERS.staff.id }], ['admin_cancel_ticket', jA, { p_actor: USERS.admin.id, p_ticket: tA[1].id }], ['begin_refund', jA, { p_order: oA.id, p_amount: 1, p_reason: 'x', p_actor: USERS.admin.id, p_source: 'admin', p_key: 'k' }], ['claim_stripe_event', jC, { p_id: 'x', p_type: 'x' }]]) {
  x = await L.rest('/rpc/' + fn, { method: 'POST', token: tok, body });
  ok(x.status === 401 || x.status === 403 || x.data?.code === '42501', `RPC ${fn} refusée à ${tok === jC ? 'un client' : tok === jS ? 'staff' : tok === jA ? 'un admin' : 'anonyme'} (${x.status} ${x.data?.code ?? ''})`);
}
x = await L.rest(`/profiles?id=eq.${USERS.cust.id}`, { method: 'PATCH', token: jC, body: { role: 'admin' } }); ok(x.status >= 400, `client : s'auto-promouvoir admin refusé (${x.status})`);
ok((await one('select role from public.profiles where id=$1', [USERS.cust.id])).role === 'customer', 'son rôle est toujours « customer »');
x = await L.rest(`/profiles?id=eq.${USERS.cust.id}`, { method: 'PATCH', token: jC, body: { first_name: 'Camille2' } }); ok(x.status === 200, 'mais il peut modifier son prénom');
await q(`update public.profiles set first_name = 'Camille' where id = $1`, [USERS.cust.id]);
x = await L.rest('/audit_log?select=id', { token: jC }); ok(x.data.length === 0, 'client : audit_log illisible');
x = await L.rest('/stripe_events?select=id', { token: jS }); ok(x.data.length === 0, 'staff : stripe_events illisible');

const f = L.summary('phase 5 (scan + admin commandes), bout en bout');
process.exit(f ? 1 : 0);
