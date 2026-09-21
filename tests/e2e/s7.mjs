// Demandes de support de l'assistant : stockées dans Supabase (table privée), gérées depuis /admin, purgées à 12 mois,
// et JAMAIS écrites dans data/content.json (dépôt public).
import fs from 'fs';
import * as L from './lib.mjs';
const { ok, section, q, one } = L;

const contentBefore = fs.readFileSync(new URL('../../data/content.json', import.meta.url), 'utf8');
await q(`truncate public.support_tickets`);
const [fresh] = await q(`insert into public.support_tickets (name, email, subject, message) values ('Camille Support','camille.support@test.local','Billet non reçu','Je n''ai pas reçu mon billet.') returning id`);
const [old] = await q(`insert into public.support_tickets (name, email, subject, message, created_at) values ('Vieille Demande','vieux@test.local','Ancien','msg', now() - interval '400 days') returning id`);

section('Accès admin');
const anon = new L.Client();
let r = await anon.req(`/api/admin/tickets/${fresh.id}`, { method: 'PATCH', body: { status: 'done' } });
ok(r.status === 401, `PATCH sans session admin → 401 (${r.status})`);
r = await anon.req(`/api/admin/tickets/${fresh.id}`, { method: 'DELETE' });
ok(r.status === 401, `DELETE sans session admin → 401 (${r.status})`);
ok((await one(`select status from public.support_tickets where id = $1`, [fresh.id])).status === 'open', 'la demande n’a pas bougé');

section('Panneau admin + purge');
const admin = new L.Client();
r = await admin.req('/api/admin/login', { method: 'POST', body: { password: 'e2e-admin' } });
ok(r.status === 200, `connexion admin (${r.status})`);
r = await admin.req('/admin/contenu');
ok(r.status === 200 && r.data.includes('camille.support@test.local'), 'la demande récente est listée dans /admin/contenu');
ok(!r.data.includes('vieux@test.local'), 'la demande de plus de 12 mois n’est pas listée');
ok((await one(`select count(*)::int as n from public.support_tickets where id = $1`, [old.id])).n === 0, 'la demande de plus de 12 mois est SUPPRIMÉE de la base à l’ouverture du panneau');

section('Modifier / supprimer');
r = await admin.req(`/api/admin/tickets/${fresh.id}`, { method: 'PATCH', body: { status: 'done' } });
ok(r.status === 200 && r.data.item.status === 'done', `PATCH → traité (${r.status})`);
ok((await one(`select status from public.support_tickets where id = $1`, [fresh.id])).status === 'done', 'statut enregistré en base');
r = await admin.req(`/api/admin/tickets/${fresh.id}`, { method: 'PATCH', body: { status: 'open' } });
ok(r.status === 200 && r.data.item.status === 'open', 'rouvrir');
r = await admin.req(`/api/admin/tickets/00000000-0000-4000-8000-000000000000`, { method: 'PATCH', body: { status: 'done' } });
ok(r.status === 404, `identifiant inconnu → 404 (${r.status})`);
r = await admin.req(`/api/admin/tickets/${fresh.id}`, { method: 'DELETE' });
ok(r.status === 200, `DELETE (${r.status})`);
ok((await one(`select count(*)::int as n from public.support_tickets`)).n === 0, 'la demande est réellement supprimée');

section('Rien dans le dépôt public');
ok(fs.readFileSync(new URL('../../data/content.json', import.meta.url), 'utf8') === contentBefore, 'data/content.json inchangé (aucune donnée personnelle écrite dans le dépôt)');

process.exit(L.summary('demandes de support (Supabase, purge 12 mois)') ? 1 : 0);
