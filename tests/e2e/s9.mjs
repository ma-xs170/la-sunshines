// Billet PDF + espace organisateur, de bout en bout (banc local : Postgres réel, faux Stripe / Resend, app Next réelle).
//  * PDF : téléchargement (propriétaire OK, autre client refusé, billet annulé refusé), poids < 500 Ko, QR du PDF scanné par /api/scan,
//    PDF en pièce jointe de l'email, échec de PDF sans conséquence sur l'email.
//  * Organisateur : chacun ne voit que SES événements, rôles (lecteur / responsable), export CSV, renvoi du PDF, messages
//    (aperçu, limites, aucun lien, confirmation), journalisation dans audit_log.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import * as L from './lib.mjs';
const { ok, section, as, q, one, webhook, sessionCompleted, mailState, USERS } = L;
const A = 'la-nuit-des-ombres', B = 'welcome-to-dominica';
const waitMail = async (pred) => { for (let i = 0; i < 40; i++) { const m = (await mailState()).sent.find(pred); if (m) return m; await new Promise((r) => setTimeout(r, 150)); } return undefined; };
const to = (m) => [].concat(m.to);
const cards = (html) => [...html.matchAll(/org-card__title"><a[^>]*>([^<]*)</g)].map((m) => m[1]);
const attBuf = (a) => Buffer.from(a.content?.data ?? a.content, 'base64');
const hasPoppler = (() => { try { execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sun-pdf-'));
const pdfBuf = async (r) => Buffer.from(await r.res.arrayBuffer());

await L.resetDb();
await q(`truncate public.organizer_message_recipients, public.organizer_messages, public.organizer_members cascade`);
await q(`delete from public.organizers where not is_default`);
await q(`update public.organizers set contact_email = 'themouv2.0971@gmail.com' where is_default`);
const admin = await as(USERS.admin), staff = await as(USERS.staff), cust = await as(USERS.cust), cust2 = await as(USERS.cust2), orgb = await as(USERS.orgb), anon = new L.Client();
const tiers = await L.setupEvent(admin);
const tiersB = await L.setupEvent(admin, { slug: B, tiers: [{ key: 's', name: 'Standard B', price_cents: 1200, quantity_total: 5, max_per_order: 5 }] });

// Organisateur A = THE MOUV (par défaut) : staff = responsable (owner), cust2 = staff de l'organisation (scan uniquement). Organisateur B (sans adresse de réponse) : orgb = owner.
const orgA = (await one(`select id from public.organizers where is_default`)).id;
const [{ id: orgB }] = await q(`insert into public.organizers (name, siret, responsible_name, contact_email) values ('Autre Orga', '', 'Dupont Olivia', '') returning id`);
await q(`update public.ticketed_events set organizer_id = $1 where event_slug = $2`, [orgB, B]);
await q(`insert into public.organizer_members (organizer_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'staff'), ($4, $5, 'owner')`, [orgA, USERS.staff.id, USERS.cust2.id, orgB, USERS.orgb.id]);

async function buy(client, slug, key, tierIds, qty, names) {
  const body = L.checkoutBody(slug, [[tierIds[key], qty]]);
  if (names) body.items[0].participants = names;
  const r = await client.req('/api/checkout', { method: 'POST', body });
  if (r.status !== 200) throw new Error('checkout ' + JSON.stringify(r.data));
  const o = await one('select * from public.orders where order_number = $1', [r.data.order_number]);
  await webhook('checkout.session.completed', sessionCompleted(o));
  return o;
}
const o1 = await buy(cust, A, 'std', tiers, 2, [{ first_name: 'Élodie', last_name: 'Dupont-Martin' }, { first_name: '=Zed', last_name: 'Injection' }]);
const o2 = await buy(cust2, A, 'early', tiers, 1, [{ first_name: 'Denis', last_name: 'Autre' }]);
const oB = await buy(cust, B, 's', tiersB, 1, [{ first_name: 'Bob', last_name: 'BetaOrga' }]);
const tk1 = await q(`select * from public.tickets where order_id = $1 order by created_at`, [o1.id]);
const tkB = (await q(`select * from public.tickets where order_id = $1`, [oB.id]))[0];

// ---------------------------------------------------------------------------------------------------------------
section('Billet PDF : accès');
let r = await anon.req(`/api/tickets/${tk1[0].id}/pdf`);
ok(r.status === 401, `sans connexion → 401 (${r.status})`);
r = await cust.req(`/api/tickets/${tk1[0].id}/pdf`, { raw: 'buffer' });
const pdf = await pdfBuf(r);
ok(r.status === 200 && r.headers.get('content-type') === 'application/pdf' && pdf.subarray(0, 5).toString() === '%PDF-', `propriétaire → PDF (${r.status}, ${r.headers.get('content-type')})`);
ok(pdf.length < 500 * 1024, `PDF sous 500 Ko (${(pdf.length / 1024).toFixed(0)} Ko)`);
ok(/attachment; filename="billet-LS-[A-Z0-9]{6}\.pdf"/.test(r.headers.get('content-disposition') ?? ''), `nom de fichier avec la référence : ${r.headers.get('content-disposition')}`);
ok(r.headers.get('cache-control')?.includes('no-store'), 'jamais mis en cache');
r = await cust2.req(`/api/tickets/${tk1[0].id}/pdf`);
ok(r.status === 404, `autre client → 404, comme un identifiant inexistant (${r.status})`);
r = await orgb.req(`/api/tickets/${tk1[0].id}/pdf`);
ok(r.status === 404, `un organisateur ne télécharge pas le billet d'un client → 404 (${r.status})`);
r = await staff.req(`/api/tickets/${tk1[0].id}/pdf`);
ok(r.status === 404, `même un responsable de l'organisateur (non propriétaire) → 404 (${r.status})`);
r = await admin.req(`/api/tickets/${tk1[0].id}/pdf`);
ok(r.status === 200, `admin → 200 (${r.status})`);
r = await cust.req(`/api/tickets/00000000-0000-4000-8000-000000000000/pdf`);
ok(r.status === 404, `identifiant inexistant → 404 (${r.status})`);
r = await cust.req(`/api/tickets/pas-un-uuid/pdf`);
ok(r.status === 404, `identifiant invalide → 404 (${r.status})`);
r = await cust2.req(`/api/orders/${o1.id}/pdf`);
ok(r.status === 404, `PDF de commande d'un autre client → 404 (${r.status})`);
r = await anon.req(`/api/orders/${o1.id}/pdf`);
ok(r.status === 401, `PDF de commande sans connexion → 401 (${r.status})`);

section('Billet PDF : contenu et QR');
fs.writeFileSync(path.join(tmp, 'ticket.pdf'), pdf);
if (hasPoppler) {
  const info = execFileSync('pdfinfo', [path.join(tmp, 'ticket.pdf')]).toString();
  ok(/Pages:\s+1\b/.test(info), 'un billet = une page');
  const fonts = execFileSync('pdffonts', [path.join(tmp, 'ticket.pdf')]).toString();
  ok(/Unbounded/.test(fonts) && /Caveat/.test(fonts) && /Inter/.test(fonts), 'polices du site embarquées (Unbounded, Caveat, Inter)');
  execFileSync('pdftoppm', ['-r', '170', '-png', '-f', '1', '-l', '1', path.join(tmp, 'ticket.pdf'), path.join(tmp, 'p')]);
  const png = PNG.sync.read(fs.readFileSync(fs.readdirSync(tmp).filter((f) => f.startsWith('p-')).map((f) => path.join(tmp, f))[0]));
  const dec = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  ok(dec?.data === tk1[0].code, 'le QR du PDF se DÉCODE en code de billet réel');
  const evId = (await one('select id from public.ticketed_events where event_slug = $1', [A])).id;
  r = await staff.req('/api/scan', { method: 'POST', body: { code: dec?.data, event_id: evId } });
  ok(r.status === 200 && r.data.result === 'valid', `le QR du PDF est accepté par le scan à l'entrée (${r.status} ${r.data?.result})`);
  const text = execFileSync('pdftotext', [path.join(tmp, 'ticket.pdf'), '-']).toString();
  const ref = (await one('select reference from public.tickets where id = $1', [tk1[0].id])).reference;
  if (process.env.DEBUG_PDF) console.log('----PDF TEXT----\n' + text + '----');
  // pdftotext insère des espaces dans les textes à espacement de lettres (la référence est volontairement espacée)
  ok(text.replace(/\s+/g, '').includes(ref) && /293 B/.test(text) && /THE MOUV/.test(text) && /106 659 956 00010/.test(text) && /Élodie/i.test(text), `texte du PDF : référence ${ref}, TVA 293 B, organisateur + SIRET, titulaire`);
  ok(/Un billet = une entrée/.test(text) || /un billet = une entrée/.test(text), 'mentions « un billet = une entrée » et rappel du QR');
} else console.log('  ⚠ poppler absent : contrôles visuels / QR du PDF ignorés');

section('PDF d\'une commande');
r = await cust.req(`/api/orders/${o1.id}/pdf`, { raw: 'buffer' });
const orderPdf = await pdfBuf(r);
ok(r.status === 200 && orderPdf.subarray(0, 5).toString() === '%PDF-', `propriétaire → PDF de commande (${r.status}, ${(orderPdf.length / 1024).toFixed(0)} Ko)`);
if (hasPoppler) {
  fs.writeFileSync(path.join(tmp, 'order.pdf'), orderPdf);
  ok(/Pages:\s+2\b/.test(execFileSync('pdfinfo', [path.join(tmp, 'order.pdf')]).toString()), 'commande de 2 billets = 2 pages');
}

section('Billet annulé / remboursé');
await q(`update public.tickets set status = 'cancelled', cancelled_at = now() where id = $1`, [tk1[1].id]);
r = await cust.req(`/api/tickets/${tk1[1].id}/pdf`);
ok(r.status === 410, `billet annulé → 410, pas de PDF (${r.status})`);
r = await cust.req(`/api/orders/${o1.id}/pdf`, { raw: 'buffer' });
const partial = await pdfBuf(r);
if (hasPoppler) { fs.writeFileSync(path.join(tmp, 'partial.pdf'), partial); ok(r.status === 200 && /Pages:\s+1\b/.test(execFileSync('pdfinfo', [path.join(tmp, 'partial.pdf')]).toString()), 'le PDF de commande ne contient plus le billet annulé'); }
await q(`update public.tickets set status = 'refunded', cancelled_at = now(), used_at = null where id = $1`, [tk1[0].id]);
r = await cust.req(`/api/orders/${o1.id}/pdf`);
ok(r.status === 410, `tous les billets annulés / remboursés → 410 (${r.status})`);
await q(`update public.tickets set status = 'valid', cancelled_at = null where order_id = $1`, [o1.id]);

section('Email : PDF en pièce jointe');
const mail = await waitMail((m) => to(m).includes(USERS.cust.email) && /Tes billets/.test(m.subject) && m.subject.includes(o1.order_number));
ok(Boolean(mail), 'email de confirmation reçu');
const atts = mail?.attachments ?? [];
const pdfAtt = atts.find((a) => /\.pdf$/.test(a.filename));
ok(pdfAtt && attBuf(pdfAtt).subarray(0, 5).toString() === '%PDF-' && pdfAtt.filename === `billets-${o1.order_number}.pdf`, `PDF joint : ${pdfAtt?.filename}`);
ok(atts.filter((a) => /\.png$/.test(a.filename)).length === 2, 'les 2 QR restent aussi dans le corps du message (images en ligne)');
ok(/compte\/billets/.test(mail?.html ?? '') && /Voir mes billets/.test(mail?.html ?? ''), 'lien vers « Mes billets »');
ok(/Unbounded/.test(mail?.html ?? '') && /#FFF8EE/i.test(mail?.html ?? '') && /#FFB238/i.test(mail?.html ?? '') && /Caveat/.test(mail?.html ?? ''), 'email aux couleurs et polices du site');
// ---------------------------------------------------------------------------------------------------------------
section('Organisateur : accès et isolation');
r = await anon.req('/organisateur');
ok(r.status >= 300 && r.status < 400 && /\/connexion\?next=/.test(r.headers.get('location') ?? ''), `sans connexion → redirection vers /connexion (${r.status})`);
r = await cust.req('/organisateur');
ok(r.status === 307 && /\/devenir-organisateur/.test(r.headers.get('location') ?? ''), `un simple client (sans organisation) est invité à déposer son dossier → /devenir-organisateur (${r.status})`);
r = await cust.req(`/organisateur/evenements/${A}`);
ok(r.status === 403, `un simple client n'accède pas à une fiche événement → 403 « Accès refusé » (${r.status})`);
r = await staff.req('/organisateur');
ok(r.status === 200 && /Bienvenue/.test(r.data) && /THE MOUV/.test(r.data), 'responsable de THE MOUV : espace organisateur');
ok(cards(r.data).join('|') === 'La Nuit Des Ombres', `il voit SES événements et pas ceux de l'autre organisateur (${cards(r.data)})`);
r = await staff.req(`/organisateur/evenements/${B}`);
ok(r.status === 404, `fiche d'un événement d'un autre organisateur → 404 (${r.status})`);
r = await orgb.req('/organisateur');
ok(r.status === 200 && cards(r.data).join('|') === 'Welcome to Dominica', `l'autre organisateur ne voit que le sien (${cards(r.data)})`);
r = await orgb.req(`/organisateur/evenements/${A}`);
ok(r.status === 404, `… et pas la fiche de THE MOUV → 404 (${r.status})`);
r = await admin.req('/organisateur');
ok(r.status === 200 && cards(r.data).join('|') === 'La Nuit Des Ombres', `admin : voit l'organisation courante (THE MOUV) (${cards(r.data)})`);
r = await admin.req('/api/organisateur/org', { method: 'POST', body: `id=${orgB}&next=/organisateur`, raw: true, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
ok(r.status === 303, `sélecteur d'organisation : redirection (${r.status})`);
r = await admin.req('/organisateur');
ok(cards(r.data).join('|') === 'Welcome to Dominica', `admin : après changement d'organisation, voit l'autre (${cards(r.data)})`);
r = await admin.req('/api/organisateur/org', { method: 'POST', body: `id=${orgA}&next=//evil.example`, raw: true, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
ok(r.status === 303 && new URL(r.headers.get('location')).origin === L.BASE, `redirection ouverte refusée (${r.headers.get('location')})`);
r = await orgb.req('/api/organisateur/org', { method: 'POST', body: `id=${orgA}&next=/organisateur`, raw: true, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
r = await orgb.req('/organisateur');
ok(cards(r.data).join('|') === 'Welcome to Dominica', `on ne peut pas choisir une organisation dont on n'est pas membre (${cards(r.data)})`);

section('Organisateur : fiche événement');
r = await staff.req(`/organisateur/evenements/${A}`);
ok(r.status === 200, `fiche événement (${r.status})`);
ok(/Billets vendus/.test(r.data) && /Places restantes/.test(r.data) && /Chiffre d’affaires/.test(r.data) && /Entrées scannées/.test(r.data), 'chiffres clés présents');
ok(/role="progressbar"/.test(r.data) && /Évolution des ventes/.test(r.data), 'barres de progression et évolution des ventes');
ok(/Jauges par tarif/.test(r.data) && /data-tier-gauge/.test(r.data) && /Lien public de l’évènement/.test(r.data) && /Voir l’évènement/.test(r.data), 'tableau de bord : jauges par tarif, lien public, bouton « Voir l’évènement »');
r = await staff.req(`/organisateur/evenements/${A}?onglet=participants`);
ok(!/Billets vendus/.test(r.data) && !/Remplissage/.test(r.data), 'l’onglet Participants n’affiche pas les cartes de statistiques');
ok(/Élodie Dupont-Martin/.test(r.data) && /Denis Autre/.test(r.data), 'liste des participants');
ok(/cust@test\.local/.test(r.data), 'email des participants (acheteur) visible du responsable');
ok(!/Bob BetaOrga/.test(r.data), 'aucun participant de l\'autre organisateur');
ok(/Exporter \(CSV\)/.test(r.data), 'le responsable voit le bouton d\'export');
const rs = await cust2.req(`/organisateur/evenements/${A}`);
ok(rs.status === 200 && !/Billets vendus/.test(rs.data) && !/Exporter/.test(rs.data), `le staff d'organisation n'a que le scan : ni chiffres, ni participants (${rs.status})`);
r = await staff.req(`/organisateur/evenements/${A}?onglet=participants&q=zed`);
ok(/=Zed/.test(r.data) && !/Élodie/.test(r.data), 'recherche par nom');
r = await staff.req(`/organisateur/evenements/${A}?onglet=participants&tier=${tiers.early}`);
ok(/Denis Autre/.test(r.data) && !/Élodie/.test(r.data), 'filtre par tarif');
await q(`update public.tickets set status = 'used', used_at = now() where id = $1`, [tk1[0].id]);
r = await staff.req(`/organisateur/evenements/${A}?onglet=participants&status=used`);
ok(/Élodie/.test(r.data) && !/Denis/.test(r.data), 'filtre par statut « Entré »');
r = await staff.req(`/organisateur/evenements/${A}?onglet=participants&sort=name&dir=asc`);
ok(r.status === 200 && r.data.indexOf('Denis Autre') < r.data.indexOf('Élodie Dupont-Martin'), 'tri par nom');
await q(`update public.tickets set status = 'valid', used_at = null where id = $1`, [tk1[0].id]);
r = await staff.req(`/organisateur/evenements/${A}?onglet=participants&tier=nimporte&status=piege&sort=DROP`);
ok(r.status === 200, 'paramètres invalides ignorés (pas d\'erreur, pas d\'injection)');
r = await staff.req(`/api/organisateur/events/${A}/flyer`, { raw: 'buffer' });
ok(r.status === 200 && r.headers.get('content-type') === 'image/jpeg', `flyer de la carte → JPEG (${r.status})`);
r = await staff.req(`/api/organisateur/events/${B}/flyer`);
ok(r.status === 404, `flyer d'un autre organisateur → 404 (${r.status})`);

section('Organisateur : export CSV');
r = await anon.req(`/api/organisateur/events/${A}/export`);
ok(r.status === 401, `sans connexion → 401 (${r.status})`);
r = await cust.req(`/api/organisateur/events/${A}/export`);
ok(r.status === 403, `simple client → 403 (${r.status})`);
r = await cust2.req(`/api/organisateur/events/${A}/export`);
ok(r.status === 403, `staff → 403 (${r.status})`);
r = await orgb.req(`/api/organisateur/events/${A}/export`);
ok(r.status === 403, `autre organisateur → 403 (${r.status})`);
r = await staff.req(`/api/organisateur/events/${A}/export`);
ok(r.status === 200 && /text\/csv/.test(r.headers.get('content-type')), `responsable → CSV (${r.status})`);
const csvRaw = await staff.req(`/api/organisateur/events/${A}/export`, { raw: 'buffer' });
const csvBytes = Buffer.from(await csvRaw.res.arrayBuffer());
ok(csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf, 'CSV UTF-8 avec BOM (accents corrects dans Excel)');
ok(/cust@test\.local/.test(r.data) && /LS-[A-Z0-9]{6}/.test(r.data) && /Standard/.test(r.data), 'le CSV contient email, référence, tarif');
ok(/'=Zed/.test(r.data) && !/;=Zed/.test(r.data), 'injection de formule neutralisée dans le CSV');
ok(!/BetaOrga/.test(r.data), 'aucun participant de l\'autre organisateur dans l\'export');
r = await staff.req(`/api/organisateur/events/${A}/export?status=piege`);
ok(r.status === 400, `filtre invalide → 400 (${r.status})`);

section('Organisateur : renvoyer le billet PDF');
await L.resetMocks();
r = await cust2.req(`/api/organisateur/events/${A}/resend`, { method: 'POST', body: { ticketId: tk1[0].id } });
ok(r.status === 403, `staff → 403 (${r.status})`);
r = await orgb.req(`/api/organisateur/events/${A}/resend`, { method: 'POST', body: { ticketId: tk1[0].id } });
ok(r.status === 403, `autre organisateur → 403 (${r.status})`);
r = await staff.req(`/api/organisateur/events/${A}/resend`, { method: 'POST', body: { ticketId: tkB.id } });
ok(r.status === 404, `billet d'un autre événement → 404 (${r.status})`);
r = await staff.req(`/api/organisateur/events/${A}/resend`, { method: 'POST', body: { ticketId: 'nimporte' } });
ok(r.status === 400, `identifiant invalide → 400 (${r.status})`);
r = await staff.req(`/api/organisateur/events/${A}/resend`, { method: 'POST', body: { ticketId: tk1[0].id } });
ok(r.status === 200, `responsable → 200 (${r.status} ${JSON.stringify(r.data)})`);
const rm = await waitMail((m) => to(m).includes(USERS.cust.email) && /Ton billet/.test(m.subject));
ok(rm && (rm.attachments ?? []).some((a) => /^billet-LS-/.test(a.filename) && attBuf(a).subarray(0, 5).toString() === '%PDF-'), 'l\'acheteur reçoit le billet PDF en pièce jointe');
r = await staff.req(`/api/organisateur/events/${A}/resend`, { method: 'POST', body: { ticketId: tk1[0].id } });
ok(r.status === 429, `2ᵉ renvoi immédiat → 429 (${r.status})`);
await q(`update public.tickets set status = 'cancelled', cancelled_at = now() where id = $1`, [tk1[1].id]);
r = await staff.req(`/api/organisateur/events/${A}/resend`, { method: 'POST', body: { ticketId: tk1[1].id } });
ok(r.status === 409, `billet annulé → 409 (${r.status})`);
await q(`update public.tickets set status = 'valid', cancelled_at = null where id = $1`, [tk1[1].id]);

section('Organisateur : messages aux participants');
const url = `/api/organisateur/events/${A}/messages`;
const msg = { subject: 'Ouverture des portes', body: 'Les portes ouvrent à 19 h. <b>Pense</b> à ta pièce d\'identité.', scope: 'all', noPromo: true };
r = await anon.req(url, { method: 'POST', body: { ...msg, action: 'preview' } });
ok(r.status === 401, `sans connexion → 401 (${r.status})`);
for (const [who, c] of [['simple client', cust], ['staff', cust2], ['autre organisateur', orgb]]) {
  r = await c.req(url, { method: 'POST', body: { ...msg, action: 'preview' } });
  ok(r.status === 403, `${who} → 403 (${r.status})`);
}
r = await staff.req(url, { method: 'POST', body: { ...msg, action: 'preview', noPromo: false } });
ok(r.status === 400, `sans confirmation « aucune promotion » → 400 (${r.status})`);
r = await staff.req(url, { method: 'POST', body: { ...msg, action: 'preview', body: 'Profite de -20 % sur https://boutique.example/promo' } });
ok(r.status === 400 && /lien/.test(r.data.error), `message avec un lien refusé → 400 (${r.status})`);
r = await staff.req(url, { method: 'POST', body: { ...msg, action: 'preview', body: 'x'.repeat(2001) } });
ok(r.status === 400, `message trop long → 400 (${r.status})`);
r = await staff.req(url, { method: 'POST', body: { ...msg, action: 'preview', scope: 'selection' } });
ok(r.status === 400, `sélection vide → 400 (${r.status})`);
r = await staff.req(url, { method: 'POST', body: { ...msg, action: 'preview' } });
ok(r.status === 200 && r.data.count === 2 && r.data.replyTo === 'themouv2.0971@gmail.com', `aperçu : 2 destinataires distincts, réponse à l'organisateur (${r.status} ${r.data?.count})`);
ok(r.data.sample.every((m) => /\*\*\*/.test(m)) && /&lt;b&gt;Pense/.test(r.data.html) && !/<b>Pense/.test(r.data.html), 'aperçu : emails masqués, HTML saisi échappé');
ok(/Unbounded/.test(r.data.html) && /Aucune promotion|aucune promotion|ni promotion/.test(r.data.html), 'aperçu : même DA que le site, mention « ni promotion »');
ok((await mailState()).sent.filter((m) => /Ouverture des portes/.test(m.subject)).length === 0, 'l\'aperçu n\'envoie rien');
r = await staff.req(url, { method: 'POST', body: { ...msg, action: 'send' } });
ok(r.status === 400, `envoi sans confirmation explicite → 400 (${r.status})`);
r = await staff.req(url, { method: 'POST', body: { ...msg, action: 'preview', scope: 'tier', tierId: tiers.std } });
ok(r.status === 200 && r.data.count === 1, 'périmètre « un tarif » : 1 destinataire (acheteur du tarif Standard)');
await L.resetMocks();
r = await staff.req(url, { method: 'POST', body: { ...msg, action: 'send', confirm: true } });
ok(r.status === 200 && r.data.sent === 2 && r.data.failed === 0 && r.data.total === 2, `envoi confirmé : 2 envoyés (${r.status} ${JSON.stringify(r.data)})`);
const sentMsgs = (await mailState()).sent.filter((m) => /Ouverture des portes/.test(m.subject));
ok(sentMsgs.length === 2 && sentMsgs.every((m) => m.reply_to === 'themouv2.0971@gmail.com' || m.replyTo === 'themouv2.0971@gmail.com' || [].concat(m.reply_to ?? m.replyTo ?? []).includes('themouv2.0971@gmail.com')), 'chaque destinataire reçoit le message, réponse = adresse de l\'organisateur');
ok(sentMsgs.every((m) => /^\[La Nuit Des Ombres\]/i.test(m.subject)) && new Set(sentMsgs.flatMap(to)).size === 2, 'objet préfixé du nom de l\'événement, un email par acheteur (dédoublonné)');
const mrow = await one(`select * from public.organizer_messages order by created_at desc limit 1`);
ok(mrow.status === 'sent' && mrow.sent_count === 2 && mrow.failed_count === 0, 'statut d\'envoi enregistré en base');
ok((await one(`select count(*)::int as n from public.organizer_message_recipients where message_id = $1 and status = 'sent'`, [mrow.id])).n === 2, 'statut par destinataire');
ok((await one(`select count(*)::int as n from public.audit_log where action = 'organizer.message_send' and actor_id = $1`, [USERS.staff.id])).n === 1, 'l\'envoi est journalisé dans audit_log');
r = await staff.req(url, { method: 'POST', body: { ...msg, subject: 'Parking', action: 'send', confirm: true } });
ok(r.status === 200, 'deuxième message');
r = await staff.req(url, { method: 'POST', body: { ...msg, subject: 'Vestiaire', action: 'send', confirm: true } });
ok(r.status === 200, 'troisième message');
r = await staff.req(url, { method: 'POST', body: { ...msg, subject: 'Quatrième', action: 'send', confirm: true } });
ok(r.status === 429, `quatrième message en 24 h → 429 (${r.status})`);
r = await staff.req(`/organisateur/evenements/${A}?onglet=participants`);
ok(/Messages envoyés/.test(r.data) && /Ouverture des portes/.test(r.data), 'historique des messages affiché');
r = await orgb.req(`/api/organisateur/events/${B}/messages`, { method: 'POST', body: { ...msg, action: 'preview' } });
ok(r.status === 409 && /À COMPLÉTER/.test(r.data.error), `organisateur sans adresse de réponse : envoi refusé → 409 (${r.status})`);

section('Journal d\'audit (RGPD)');
const acts = await q(`select action, count(*)::int n from public.audit_log where action like 'organizer.%' group by action`);
const n = Object.fromEntries(acts.map((a) => [a.action, a.n]));
ok(n['organizer.participants_view'] >= 1, `consultation des participants journalisée (${n['organizer.participants_view']})`);
ok(n['organizer.export_csv'] >= 1, `export CSV journalisé (${n['organizer.export_csv']})`);
ok(n['organizer.message_send'] === 3, `3 envois journalisés (${n['organizer.message_send']})`);
ok(n['organizer.ticket_resend'] >= 1, `renvoi de billet journalisé (${n['organizer.ticket_resend']})`);
const exp = await one(`select meta from public.audit_log where action = 'organizer.export_csv' order by id desc limit 1`);
ok(exp.meta.rows === 3, 'l\'export journalise le nombre de lignes exportées');

fs.rmSync(tmp, { recursive: true, force: true });
process.exit(L.summary('billet PDF + espace organisateur') ? 1 : 0);
