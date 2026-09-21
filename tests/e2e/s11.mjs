// Actualités (banc local) : publication par les admins seulement, lecture par les organisateurs, lu / non lu par utilisateur,
// bandeau des publications épinglées, contenu sans HTML, cloisonnement.
import * as L from './lib.mjs';
const { ok, section, as, q, one, USERS } = L;

await L.resetDb();
await q(`truncate public.organizer_members cascade`);
await q(`truncate public.news_posts cascade`);
await q(`delete from public.organizers where not is_default`);
const admin = await as(USERS.admin), owner = await as(USERS.staff), crew = await as(USERS.cust2), cust = await as(USERS.cust), anon = new L.Client();
const orgA = (await one(`select id from public.organizers where is_default`)).id;
await q(`insert into public.organizer_members (organizer_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'staff')`, [orgA, USERS.staff.id, USERS.cust2.id]);
const post = (o) => ({ id: null, title: 'Nouvelle page Analyse', category: 'nouveaute', body: 'Suivez vos ventes.', image_url: null, status: 'published', pinned: false, ...o });
const badge = (html) => (html.match(/oside__badge"[^>]*>([^<]*)</) ?? [])[1] ?? '0';

section('Écriture réservée aux admins');
let r = await anon.req('/api/admin/news', { method: 'PUT', body: post() }); ok(r.status === 401, `sans connexion → 401 (${r.status})`);
r = await owner.req('/api/admin/news', { method: 'PUT', body: post() }); ok(r.status === 403, `propriétaire d'organisation → 403 (${r.status})`);
r = await crew.req('/api/admin/news', { method: 'PUT', body: post() }); ok(r.status === 403, `staff d'organisation → 403 (${r.status})`);
r = await owner.req('/api/admin/news'); ok(r.status === 403, `lecture admin refusée aux organisateurs (${r.status})`);
r = await owner.req('/admin/actualites'); ok(r.status === 403 && /Accès refusé/.test(r.data), 'page /admin/actualites : accès refusé (403) à un organisateur');
r = await anon.req('/admin/actualites'); ok(r.status >= 300 && r.status < 400, `page /admin/actualites sans connexion → redirection (${r.status})`);
r = await admin.req('/admin/actualites'); ok(r.status === 200 && /Nouvelle publication/.test(r.data), 'page /admin/actualites pour un admin');
ok((await one(`select count(*)::int n from public.news_posts`)).n === 0, 'rien n’a été écrit par les refus');

section('Validation et nettoyage');
r = await admin.req('/api/admin/news', { method: 'PUT', body: post({ category: 'promo' }) }); ok(r.status === 400, `catégorie inconnue → 400 (${r.status})`);
r = await admin.req('/api/admin/news', { method: 'PUT', body: post({ title: '   ' }) }); ok(r.status === 400, `titre vide → 400 (${r.status})`);
r = await admin.req('/api/admin/news', { method: 'PUT', body: post({ body: '<<>>' }) }); ok(r.status === 400, `contenu vide après nettoyage → 400 (${r.status})`);
for (const bad of ['javascript:alert(1)', 'http://x.io/a.png', 'data:image/png;base64,AAAA']) {
  r = await admin.req('/api/admin/news', { method: 'PUT', body: post({ image_url: bad }) }); ok(r.status === 400, `image refusée : ${bad.slice(0, 22)} (${r.status})`);
}
r = await admin.req('/api/admin/news', { method: 'PUT', body: post({ title: 'Brouillon caché', status: 'draft' }) }); const draft = r.data?.id; ok(r.status === 200 && draft, 'brouillon créé');
r = await admin.req('/api/admin/news', { method: 'PUT', body: post({ title: 'Maintenance <b>samedi</b>', category: 'important', body: 'Coupure de 10 min.\n\n<script>alert(1)</script>Merci.', image_url: 'https://cdn.example/x.png', pinned: true }) });
const pinned = r.data?.id; ok(r.status === 200 && pinned, 'publication épinglée créée (HTML dans le texte)');
r = await admin.req('/api/admin/news', { method: 'PUT', body: post() }); const plain = r.data?.id; ok(r.status === 200 && plain, 'publication simple créée');
const row = await one(`select title, body from public.news_posts where id = $1`, [pinned]);
ok(!/[<>]/.test(row.title + row.body) && row.title === 'Maintenance b samedi /b', `contenu nettoyé en base : « ${row.title} »`);
r = await admin.req('/api/admin/news'); ok(r.status === 200 && r.data.length === 3, 'l’admin voit tout, brouillon compris');

section('Lecture par les organisateurs');
r = await cust.req('/organisateur/actualites'); ok((r.status === 200 && /Accès réservé/.test(r.data)) || r.status === 403 || (r.status >= 300 && r.status < 400), `client sans organisation : pas d’actualités (${r.status})`);
r = await anon.req('/organisateur/actualites'); ok(r.status >= 300 && r.status < 400, `sans connexion → connexion (${r.status})`);
r = await owner.req('/organisateur/actualites');
ok(r.status === 200 && /Maintenance b samedi \/b/.test(r.data) && /Nouvelle page Analyse/.test(r.data), 'propriétaire : voit les publications');
ok(!/Brouillon caché/.test(r.data), 'brouillon invisible');
ok(!/<script>alert|<b>samedi/.test(r.data.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')), 'aucun HTML injecté dans la page');
ok(/Non lue/.test(r.data) && /2 non lues/.test(r.data) && /Tout marquer comme lu/.test(r.data), 'compteur « 2 non lues » et bouton « Tout marquer comme lu »');
ok(/https:\/\/cdn\.example\/x\.png/.test(r.data) && /referrerPolicy|referrerpolicy/i.test(r.data), 'image https affichée sans envoyer le referrer');
const iPlain = r.data.indexOf('Nouvelle page Analyse'), iPinned = r.data.indexOf('Maintenance b samedi');
const dates = await q(`select title from public.news_posts where status = 'published' order by published_at desc`);
ok(dates[0].title === 'Nouvelle page Analyse' && iPlain < iPinned, 'de la plus récente à la plus ancienne');
r = await crew.req('/organisateur/actualites'); ok(r.status === 200 && /Nouvelle page Analyse/.test(r.data), 'staff d’organisation : peut lire');
ok(!/<form[^>]*actualites/.test(r.data) && !/Nouvelle publication/.test(r.data), 'aucune option d’écriture côté organisateur');

section('Pastille « non lus » et lu / non lu par utilisateur');
r = await owner.req('/organisateur'); ok(badge(r.data) === '2', `cloche du propriétaire : 2 (${badge(r.data)})`);
ok(/org-banner/.test(r.data) && /Maintenance b samedi/.test(r.data) && !/org-banner[^>]*>[^]*Nouvelle page Analyse/.test(r.data.split('org-banners')[1]?.split('</div>')[0] ?? ''), 'bandeau : seule la publication épinglée s’affiche en haut de l’accueil');
r = await owner.req('/api/organisateur/actualites/read', { method: 'POST', body: { id: 'pas-un-uuid' } }); ok(r.status === 400, `id invalide → 400 (${r.status})`);
r = await anon.req('/api/organisateur/actualites/read', { method: 'POST', body: {} }); ok(r.status === 401, `sans connexion → 401 (${r.status})`);
r = await cust.req('/api/organisateur/actualites/read', { method: 'POST', body: {} }); ok(r.status === 403, `client sans organisation → 403 (${r.status})`);
r = await owner.req('/api/organisateur/actualites/read', { method: 'POST', body: { id: plain } }); ok(r.status === 200 && r.data.marked === 1, 'une publication marquée lue');
r = await owner.req('/organisateur'); ok(badge(r.data) === '1', `cloche du propriétaire : 1 (${badge(r.data)})`);
r = await crew.req('/organisateur'); ok(badge(r.data) === '2', `cloche du staff inchangée : 2 — l’état lu est PAR utilisateur (${badge(r.data)})`);
r = await owner.req('/api/organisateur/actualites/read', { method: 'POST', body: {} }); ok(r.status === 200 && r.data.marked === 1, '« Tout marquer comme lu »');
r = await owner.req('/organisateur'); ok(badge(r.data) === '0', `plus de pastille (${badge(r.data)})`);
r = await owner.req('/organisateur/actualites'); ok(/Tout est lu/.test(r.data), 'compteur : « Tout est lu »');
r = await admin.req('/api/admin/news', { method: 'PUT', body: post({ id: draft, title: 'Brouillon publié', status: 'published' }) }); ok(r.status === 200, 'un brouillon est publié');
r = await owner.req('/organisateur'); ok(badge(r.data) === '1', `la nouvelle publication est non lue (${badge(r.data)})`);
r = await admin.req('/api/admin/news', { method: 'PUT', body: post({ id: draft, title: 'Brouillon publié', status: 'draft' }) });
r = await owner.req('/organisateur'); ok(badge(r.data) === '0', `dépublication : la pastille retombe (${badge(r.data)})`);

section('Suppression et audit');
r = await owner.req(`/api/admin/news/${plain}`, { method: 'DELETE' }); ok(r.status === 403, `organisateur ne supprime pas (${r.status})`);
r = await admin.req(`/api/admin/news/${plain}`, { method: 'DELETE' }); ok(r.status === 200, 'admin supprime');
r = await admin.req(`/api/admin/news/${plain}`, { method: 'DELETE' }); ok(r.status === 404, `déjà supprimée → 404 (${r.status})`);
r = await admin.req('/api/admin/news/pas-un-uuid', { method: 'DELETE' }); ok(r.status === 400, `id invalide → 400 (${r.status})`);
const acts = await q(`select action, count(*)::int n from public.audit_log where entity = 'news_post' group by action`);
const n = Object.fromEntries(acts.map((a) => [a.action, a.n]));
ok(n['news.create'] === 3 && n['news.update'] === 2 && n['news.delete'] === 1, `écritures journalisées dans audit_log (${JSON.stringify(n)})`);

process.exit(L.summary('actualités') ? 1 : 0);
