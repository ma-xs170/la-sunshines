#!/usr/bin/env node
// =====================================================================
// node scripts/migrate-private-data.mjs [--strip]
//
// Transfère les données PRIVÉES encore présentes dans data/content.json (emails d'artistes, abonnés, demandes de
// vérification…) vers les tables Supabase de la migration 008 (idempotent : rejouable sans doublon), puis, avec
// --strip, les retire du fichier. Lit POSTGRES_URL_NON_POOLING (ou POSTGRES_URL) dans .env.local ; n'affiche que
// des compteurs, jamais une adresse ni un secret.
// =====================================================================
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'data', 'content.json');
const env = { ...process.env };
try {
  for (const l of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
    const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* pas de .env.local */ }
const url = env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL;
if (!url) { console.error('POSTGRES_URL_NON_POOLING (ou POSTGRES_URL) manquante.'); process.exit(2); }

const content = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const c = new pg.Client({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ''), ssl: { rejectUnauthorized: false } });
await c.connect();
const counts = { artist_emails: 0, artist_subscriptions: 0, artist_notifications: 0, artist_verifications: 0, support_tickets: 0 };
try {
  await c.query('begin');
  for (const a of content.artists ?? []) {
    const email = String(a.email ?? '').trim().toLowerCase();
    if (!email || !a.slug) continue;
    const r = await c.query('insert into public.artist_emails (artist_slug, email) values ($1, $2) on conflict (artist_slug) do nothing', [a.slug, email]);
    counts.artist_emails += r.rowCount;
  }
  for (const s of content.subscriptions ?? []) {
    const email = String(s.email ?? '').trim().toLowerCase();
    if (!email || !s.artistSlug || String(s.token ?? '').length < 16) continue;
    const r = await c.query('insert into public.artist_subscriptions (artist_slug, email, token, created_at) values ($1, $2, $3, $4) on conflict do nothing', [s.artistSlug, email, s.token, s.createdAt || new Date().toISOString()]);
    counts.artist_subscriptions += r.rowCount;
  }
  for (const k of content.notifiedSubscribers ?? []) {
    const [ev, email] = String(k).split('::');
    if (!ev || !email) continue;
    const r = await c.query('insert into public.artist_notifications (event_slug, email) values ($1, $2) on conflict do nothing', [ev, email.toLowerCase()]);
    counts.artist_notifications += r.rowCount;
  }
  for (const v of content.verificationRequests ?? []) {
    const r = await c.query('insert into public.artist_verifications (artist_slug, name, email, blob_url, blob_pathname, file_type, created_at) values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing',
      [v.artistSlug, String(v.name ?? '').slice(0, 120) || '—', String(v.email ?? '').toLowerCase(), v.blobUrl ?? '', v.blobPathname ?? '', v.fileType ?? '', v.createdAt || new Date().toISOString()]);
    counts.artist_verifications += r.rowCount;
  }
  for (const t of content.tickets ?? []) {
    const r = await c.query('insert into public.support_tickets (name, email, phone, subject, message, status, created_at) values ($1,$2,$3,$4,$5,$6,$7)',
      [String(t.name ?? '').slice(0, 120) || '—', t.email, String(t.phone ?? '').slice(0, 40), String(t.subject ?? '—').slice(0, 160), String(t.message ?? '—').slice(0, 4000), t.status === 'done' ? 'done' : 'open', t.createdAt || new Date().toISOString()]);
    counts.support_tickets += r.rowCount;
  }
  // les jetons de connexion (30 min) ne sont PAS repris : ils sont périmés, on en fera de nouveaux
  await c.query('commit');
} catch (e) {
  await c.query('rollback').catch(() => {});
  console.error('ÉCHEC, rien n’a été modifié :', e.message);
  process.exit(1);
} finally { await c.end(); }
console.log('transféré vers Supabase :', JSON.stringify(counts));

if (process.argv.includes('--strip')) {
  content.artists = (content.artists ?? []).map((a) => ({ ...a, email: '' }));
  for (const k of ['tickets', 'verificationRequests', 'subscriptions', 'notifiedSubscribers', 'artistLoginTokens']) content[k] = [];
  fs.writeFileSync(FILE, `${JSON.stringify(content, null, 2)}\n`);
  console.log('data/content.json nettoyé (emails, abonnés, jetons, demandes retirés).');
}
