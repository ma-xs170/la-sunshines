#!/usr/bin/env node
// =====================================================================
// npm run smoke -- <URL>          (ou : SMOKE_URL=https://… npm run smoke)
//
// Vérifie un déploiement SANS RIEN ÉCRIRE :
//  * uniquement des lectures (GET) ; les quelques POST/PATCH envoyés SANS session doivent
//    être REFUSÉS (401/403/405/503) — s'ils étaient acceptés, le test échoue ;
//  * aucun compte créé, aucune commande, aucun paiement.
//
// Contrôle : pages publiques, pages et routes protégées, refus d'achat quand le flag est
// sur Bizouk (page événement / accueil sans panneau interne, /cgv en 404, /api/checkout
// jamais accepté sans session), webhook Stripe fermé sans signature valide.
//
// Preview protégée par Vercel : SMOKE_BYPASS=<secret de contournement> npm run smoke -- <URL>
// (Vercel > Settings > Deployment Protection > Protection Bypass for Automation).
// Code de sortie : 0 = tout OK, 1 = au moins un échec.
// =====================================================================
const base = (process.argv[2] || process.env.SMOKE_URL || 'http://localhost:3000').replace(/\/$/, '');
const headers = process.env.SMOKE_BYPASS ? { 'x-vercel-protection-bypass': process.env.SMOKE_BYPASS } : {};
const UUID = '00000000-0000-4000-8000-000000000000';
let fails = 0, oks = 0, warns = 0;
const line = (s, msg) => console.log(`${s === 'ok' ? '  ✔' : s === 'warn' ? '  ⚠' : '  ✘'} ${msg}`);
const ok = (c, msg, detail = '') => { if (c) { oks++; line('ok', msg); } else { fails++; line('ko', `${msg}${detail ? ' — ' + detail : ''}`); } return c; };
const warn = (msg) => { warns++; line('warn', msg); };
const section = (t) => console.log(`\n${t}`);

async function hit(path, { method = 'GET', body } = {}) {
  try {
    const res = await fetch(base + path, { method, redirect: 'manual', headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
    const text = method === 'GET' || res.status >= 400 ? await res.text().catch(() => '') : '';
    return { status: res.status, text, location: res.headers.get('location') || '' };
  } catch (e) { return { status: 0, text: '', location: '', error: String(e.message || e) }; }
}
const sso = (r) => r.status === 401 && /vercel|sso|authentication required/i.test(r.text);

console.log(`Smoke test — ${base}\n(lecture seule : aucune donnée n'est créée ni modifiée)`);

section('1. Site joignable');
const home = await hit('/');
if (sso(home)) { console.log('\n  ✘ Le déploiement est protégé par Vercel (401 SSO). Fournis SMOKE_BYPASS=<secret de contournement> (voir l\'en-tête du script).'); process.exit(1); }
if (!ok(home.status === 200, `GET / → 200`, `reçu ${home.status || home.error}`)) { console.log('\nSite injoignable : arrêt.'); process.exit(1); }

section('2. Pages publiques (200)');
let slug = 'la-nuit-des-ombres';
const sm = await hit('/sitemap.xml');
const m = sm.text.match(/\/editions\/([a-z0-9-]+)</); if (m) slug = m[1];
for (const p of ['/editions', `/editions/${slug}`, '/infos', '/interdits', '/contact', '/mentions-legales', '/politique-de-confidentialite', '/connexion', '/inscription', '/mot-de-passe-oublie']) {
  const r = await hit(p); ok(r.status === 200, `GET ${p} → 200`, `reçu ${r.status}`);
}

section('3. Pages protégées (jamais de contenu sans session)');
for (const p of ['/compte', '/compte/billets', '/commande/succes?order=SUN-000000', '/commande/annulee?order=SUN-000000', '/admin/scan', '/admin/billetterie', '/admin/billetterie/commandes', '/admin/billetterie/invitations', `/compte/billets/${UUID}`]) {
  const r = await hit(p);
  const redirected = r.status === 307 && /\/connexion/.test(r.location);
  const inert = r.status === 200 && /(configuré|Accès refusé|Bientôt disponible)/i.test(r.text) && !/(scan__video|class="ord"|Rembourser)/.test(r.text);
  ok(redirected || inert, `${p} → ${redirected ? 'redirigé vers /connexion' : inert ? 'page inerte / refusée' : 'CONTENU EXPOSÉ ?'}`, `statut ${r.status}`);
}

section('4. Routes API protégées (refusées sans session)');
const denied = (s) => [401, 403, 404, 405, 503].includes(s);
for (const [m2, p, body] of [
  ['GET', '/api/billetterie/admin/orders'], ['GET', '/api/billetterie/admin/settings'], ['GET', `/api/billetterie/admin/events/${slug}`],
  ['GET', `/api/billetterie/admin/events/${slug}/stats`], ['GET', `/api/billetterie/admin/export/participants?event=${slug}`], ['GET', `/api/billetterie/admin/export/orders?event=${slug}`],
  ['GET', `/api/billetterie/admin/orders/${UUID}`], ['GET', `/api/scan/stats?event_id=${UUID}`], ['GET', `/api/tickets/${UUID}/qr`], ['GET', `/api/tickets/${UUID}/image`],
  ['PATCH', '/api/billetterie/admin/settings', { key: 'ticketing_mode', value: 'native' }],
  ['PUT', `/api/billetterie/admin/events/${slug}`, {}], ['PUT', `/api/billetterie/admin/events/${slug}/tiers`, {}],
  ['POST', '/api/billetterie/admin/invitations', {}], ['POST', `/api/billetterie/admin/orders/${UUID}/refund`, {}], ['POST', `/api/billetterie/admin/orders/${UUID}/resend`, {}],
  ['POST', `/api/billetterie/admin/tickets/${UUID}/cancel`, {}], ['POST', '/api/scan', { code: 'X', event_id: UUID }], ['PATCH', '/api/account/profile', {}],
]) {
  const r = await hit(p, { method: m2, body }); ok(denied(r.status), `${m2} ${p.split('?')[0]} → ${r.status} (refusé)`, `statut inattendu ${r.status}`);
}

section('5. Achat impossible tant que le flag est sur Bizouk');
const cgv = await hit('/cgv');
const nativeMode = cgv.status === 200;
const ev = await hit(`/editions/${slug}`); const homeTxt = home.text;
if (!nativeMode) {
  ok(cgv.status === 404, '/cgv → 404 (billetterie interne invisible)');
  ok((await hit('/remboursement')).status === 404, '/remboursement → 404');
  ok(!/class="tp /.test(ev.text) && !/class="tp /.test(homeTxt), 'aucun panneau de tarifs interne sur l\'accueil ni sur la page événement');
  ok(/bizouk|payment-frame|Bizouk/i.test(ev.text + homeTxt), 'Bizouk toujours présent (widget ou lien)');
} else {
  warn('Mode « billetterie interne » ACTIF sur ce déploiement : contrôle « flag sur Bizouk » sauté.');
  ok(/class="tp /.test(ev.text) || !/tarif/i.test(ev.text), 'panneau de tarifs présent sur la page événement');
}
const co = await hit('/api/checkout', { method: 'POST', body: { slug, items: [], accept_terms: true, guardian_consent: true } });
ok(denied(co.status) || co.status === 400, `POST /api/checkout sans session → ${co.status} (jamais accepté)`, 'un achat a été accepté !');
ok(![200, 201, 202].includes(co.status), '/api/checkout ne crée ni réservation ni session Stripe sans compte connecté');
const av = await hit(`/api/billetterie/${slug}/disponibilite`);
ok(av.status === 200 || av.status === 404 || av.status === 503, `GET /api/billetterie/${slug}/disponibilite → ${av.status} (lecture publique de compteurs)`);
if (av.status === 200 && !nativeMode) { try { const j = JSON.parse(av.text); if (j.tiers?.length) warn('Des tarifs sont exposés en lecture (compteurs seulement) alors que le flag est sur Bizouk : sans danger, mais visible.'); } catch { /* ignore */ } }

section('6. Webhook Stripe fermé sans signature valide');
let w = await hit('/api/stripe/webhook');
ok(w.status === 405, `GET /api/stripe/webhook → ${w.status} (405 attendu)`);
w = await hit('/api/stripe/webhook', { method: 'POST', body: { id: 'evt_smoke', type: 'checkout.session.completed' } });
ok([400, 503].includes(w.status), `POST sans signature → ${w.status} (400 ou 503 attendu, jamais 200)`);
try { const r = await fetch(base + '/api/stripe/webhook', { method: 'POST', headers: { ...headers, 'content-type': 'application/json', 'stripe-signature': 't=1,v1=00' }, body: '{}' }); ok([400, 503].includes(r.status), `POST avec fausse signature → ${r.status} (400 ou 503 attendu)`); } catch (e) { ok(false, 'POST fausse signature', String(e)); }

section('7. Fuites');
const leak = await hit('/api/billetterie/admin/settings');
ok(!/eyJ|sk_(test|live)|whsec_|service_role/.test(leak.text + home.text), 'aucune clé / secret dans les réponses testées');
ok(!(await hit('/.env.local')).text.includes('ADMIN_PASSWORD'), '/.env.local non servi');

console.log(`\n${fails ? '✘ ÉCHEC' : '✔ TOUT OK'} — ${oks} contrôle(s) réussi(s), ${fails} en échec, ${warns} avertissement(s) — ${base}`);
process.exit(fails ? 1 : 0);
