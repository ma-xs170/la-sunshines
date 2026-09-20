import * as L from './lib.mjs';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
const { ok, section, as, q, one, webhook, sessionCompleted, stripeState, mailState, USERS } = L;
const SLUG = 'la-nuit-des-ombres';
const decodeQr = (buf) => { const p = PNG.sync.read(buf); const r = jsQR(new Uint8ClampedArray(p.data), p.width, p.height); return r?.data ?? null; };
const attBuf = (a) => Buffer.from(a.content?.data ?? a.content, 'base64');

await L.resetDb();
const admin = await as(USERS.admin), cust = await as(USERS.cust), cust2 = await as(USERS.cust2), anon = new L.Client();
const tiers = await L.setupEvent(admin);
const orderOf = (n) => one('select * from public.orders where order_number = $1', [n]);
async function buy(client, key, qty, names) {
  const body = L.checkoutBody(SLUG, [[tiers[key], qty]]);
  if (names) body.items[0].participants = names;
  const r = await client.req('/api/checkout', { method: 'POST', body });
  if (r.status !== 200) throw new Error('checkout ' + JSON.stringify(r.data));
  return orderOf(r.data.order_number);
}

section('Email de confirmation (QR en pièces jointes, HTML échappé)');
const evil = [{ first_name: '<script>alert(1)</script>', last_name: 'Pirate' }, { first_name: 'Zoé', last_name: 'O\'Brien & Fils' }];
let o1 = await buy(cust, 'std', 2, evil);
let w = await webhook('checkout.session.completed', sessionCompleted(o1));
ok(w.status === 200, 'webhook 200');
let ms = await mailState();
ok(ms.sent.length === 1, `1 email envoyé (${ms.sent.length})`);
const m = ms.sent[0];
ok(JSON.stringify(m.to) === JSON.stringify([USERS.cust.email]) || m.to?.[0] === USERS.cust.email, `destinataire : ${JSON.stringify(m.to)}`);
ok(m.from === 'La Sunshines <billets@test.local>', `expéditeur MAIL_FROM : ${m.from}`);
ok(m.subject.includes(o1.order_number) && /Tes billets/.test(m.subject), `sujet : ${m.subject}`);
const qrAtts = (m.attachments ?? []).filter((a) => /\.png$/.test(a.filename));
ok(qrAtts.length === 2, `${qrAtts.length} QR en pièces jointes`);
ok((m.attachments ?? []).some((a) => a.filename === `billets-${o1.order_number}.pdf` && attBuf(a).subarray(0, 5).toString() === '%PDF-'), 'PDF des billets en pièce jointe');
ok(/cid:qr-0/.test(m.html) && /cid:qr-1/.test(m.html) && qrAtts.every((a) => /^qr-/.test(a.content_id ?? a.contentId ?? '')), 'images référencées par Content-ID (compatible Gmail)');
ok(!m.html.includes('<script>alert') && m.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'nom malveillant <script> échappé dans le HTML');
ok(m.html.includes('O&#39;Brien &amp; Fils'), 'apostrophe et & échappés');
ok(/293 B/.test(m.html) && m.html.includes(o1.order_number) && m.html.includes('/compte/billets/'), 'mention 293 B, numéro de commande, lien vers le billet');
ok(m.text && /Billet 1/.test(m.text), 'version texte présente');
const tks = await q('select * from public.tickets where order_id = $1 order by created_at', [o1.id]);
const decoded = qrAtts.map((a) => decodeQr(attBuf(a)));
ok(decoded.every((c, i) => tks.some((t) => t.code === c)), `les QR des pièces jointes se DÉCODENT en codes de billets réels (${decoded.map((d) => d?.slice(0, 6) + '…')})`);
o1 = await orderOf(o1.order_number);
ok(o1.email_status === 'sent' && o1.email_attempts === 1 && o1.email_sent_at && !o1.email_last_error, `commande : email_status=${o1.email_status}, tentatives=${o1.email_attempts}`);

section('Doublons');
await webhook('checkout.session.completed', sessionCompleted(o1));
await Promise.all(Array.from({ length: 5 }, () => webhook('checkout.session.completed', sessionCompleted(o1))));
ok((await mailState()).sent.length === 1, 'webhook rejoué ×6 → toujours 1 seul email');

section('Échec d\'envoi : le webhook réussit, le billet est disponible');
await fetch(L.MAIL + '/__fail?on=1');
let o2 = await buy(cust2, 'early', 1);
w = await webhook('checkout.session.completed', sessionCompleted(o2));
o2 = await orderOf(o2.order_number);
ok(w.status === 200, `webhook 200 malgré l'échec Resend (${w.status})`);
ok(o2.status === 'paid' && (await one('select count(*)::int as n from public.tickets where order_id=$1', [o2.id])).n === 1, 'commande payée, billet créé');
ok(o2.email_status === 'failed' && o2.email_attempts === 1 && /domain/i.test(o2.email_last_error ?? ''), `email_status=${o2.email_status}, tentatives=${o2.email_attempts}, erreur « ${o2.email_last_error} »`);
const t2 = await one('select id from public.tickets where order_id = $1', [o2.id]);
let r = await cust2.req(`/compte/billets/${t2.id}`);
ok(r.status === 200 && r.data.includes(`/api/tickets/${t2.id}/qr`), 'le billet reste ouvrable dans « Mes billets » malgré l\'échec d\'email');
await fetch(L.MAIL + '/__fail?on=0');
await webhook('checkout.session.completed', sessionCompleted(o2));                         // rejeu immédiat
ok((await orderOf(o2.order_number)).email_attempts === 1 && (await mailState()).sent.length === 1, 'rejeu < 2 min : aucune nouvelle tentative (anti-doublon)');
await q(`update public.orders set email_last_attempt_at = now() - interval '5 minutes' where id = $1`, [o2.id]);
await webhook('checkout.session.completed', sessionCompleted(o2));                         // rejeu plus tard
o2 = await orderOf(o2.order_number);
ok(o2.email_status === 'sent' && o2.email_attempts === 2 && !o2.email_last_error && (await mailState()).sent.length === 2, `rejeu plus tard → renvoi réussi (tentatives=${o2.email_attempts}, erreur effacée)`);

section('Mes billets : accès et isolation');
const t1 = tks[0];
r = await cust.req('/compte/billets');
ok(r.status === 200 && r.data.includes(o1.order_number) && r.data.includes('Billets à venir'), '/compte/billets liste commandes et billets à venir');
ok(!r.data.includes(o2.order_number), 'la commande d\'un AUTRE client n\'apparaît pas');
r = await cust.req(`/compte/billets/${t1.id}`);
ok(r.status === 200 && r.data.includes(`/api/tickets/${t1.id}/qr`) && r.data.includes('Pirate') && r.data.includes('La Nuit Des Ombres'), 'page du billet : QR, participant, événement');
ok(!r.data.includes('<script>alert(1)</script>') && r.data.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'nom malveillant échappé sur la page');
ok(/Salle des Fêtes/.test(r.data) && /Standard/.test(r.data), 'lieu et tarif affichés (snapshot)');
r = await cust2.req(`/compte/billets/${t1.id}`);
ok(r.status === 404, `billet d'un autre client → 404 (${r.status})`);
r = await anon.req(`/compte/billets/${t1.id}`);
ok(r.status === 307, `non connecté → redirection connexion (${r.status})`);
r = await cust.req(`/api/tickets/${t1.id}/qr`, { raw: 'buffer' });
const buf = Buffer.from(await r.res.arrayBuffer());
ok(r.status === 200 && r.headers.get('content-type') === 'image/png' && decodeQr(buf) === t1.code, 'QR du billet : PNG qui se décode en code du billet');
ok(/no-store/.test(r.headers.get('cache-control')), 'QR non mis en cache');
r = await cust2.req(`/api/tickets/${t1.id}/qr`, { raw: 'buffer' });
ok(r.status === 404, `QR d'un autre client → 404 (${r.status})`);
r = await anon.req(`/api/tickets/${t1.id}/qr`, { raw: 'buffer' });
ok(r.status === 404, `QR sans connexion → 404 (${r.status})`);
r = await cust.req(`/api/tickets/${t1.id}/image?download=1`, { raw: 'buffer' });
const img = Buffer.from(await r.res.arrayBuffer());
ok(r.status === 200 && r.headers.get('content-type') === 'image/png' && img.length > 8000 && /attachment; filename="billet-SUN-/.test(r.headers.get('content-disposition') ?? ''), `billet PNG téléchargeable (${img.length} octets)`);
r = await cust2.req(`/api/tickets/${t1.id}/image`, { raw: 'buffer' });
ok(r.status === 404, 'billet PNG d\'un autre client → 404');
await q(`update public.tickets set status = 'refunded' where id = $1`, [t1.id]);
r = await cust.req(`/api/tickets/${t1.id}/qr`, { raw: 'buffer' });
ok(r.status === 404, 'billet remboursé → plus de QR');
r = await cust.req(`/compte/billets/${t1.id}`);
ok(r.status === 200 && /plus valable/.test(r.data) && !r.data.includes(`/api/tickets/${t1.id}/qr`), 'page du billet remboursé : « n\'est plus valable », pas de QR');
r = await cust.req(`/api/tickets/pas-un-uuid/qr`, { raw: 'buffer' });
ok(r.status === 404, 'id invalide → 404');

section('Email « commande non confirmée » (stock perdu)');
await q(`update public.ticket_tiers set quantity_total = 5 where id = $1`, [tiers.early]);
await q(`update public.ticket_tiers set quantity_total = (select count(*) from public.tickets where tier_id=$1 and status in ('valid','used')) + 2 where id = $1`, [tiers.early]);
const late = await buy(cust, 'early', 2);
await q(`update public.orders set expires_at = now() - interval '1 minute' where id = $1`, [late.id]);
await buy(cust2, 'early', 2);
const before = (await mailState()).sent.length;
w = await webhook('checkout.session.completed', sessionCompleted(late));
ms = await mailState();
const lost = ms.sent[before];
ok(w.status === 200 && ms.sent.length === before + 1 && /non confirmée/.test(lost?.subject ?? '') && /intégralement/.test(lost?.html ?? ''), `email de remboursement envoyé : « ${lost?.subject} »`);
ok((lost?.attachments ?? []).length === 0, 'aucun QR dans cet email');
ok((await orderOf(late.order_number)).email_status === 'sent', 'statut d\'email tracé aussi pour ce cas');

const f = L.summary('phase 4 (billets QR + emails), bout en bout');
process.exit(f ? 1 : 0);
