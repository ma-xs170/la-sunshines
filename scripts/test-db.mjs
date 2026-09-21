#!/usr/bin/env node
// =====================================================================
// npm run test:db
//
// Applique les migrations (supabase/migrations) puis TOUS les tests SQL et de concurrence
// (supabase/tests) sur une base Postgres JETABLE lancée en local (embedded-postgres, port 54339,
// supprimée à la fin). L'environnement Supabase (rôles anon / authenticated / service_role,
// schéma auth, droits par défaut) est simulé.
//
// Ne se connecte JAMAIS à ta vraie base : aucune variable POSTGRES_URL* n'est lue.
// =====================================================================
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const R = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase') + path.sep;
const DIR = path.join(os.tmpdir(), 'sunshines-testdb-' + process.pid);
const PORT = Number(process.env.TESTDB_PORT || 54339);
const migrations = fs.readdirSync(R + 'migrations').filter((f) => f.endsWith('.sql')).sort();
const sqlTests = ['001_rls_profiles', '002_rls_ticketing', '002_rules', '002_verify', '003_fulfill', '004_email', '005_scan_admin', '007_support', '008_artist_private', '009_organizers', '010_organizer_ui', '011_organizer_tiers_scan', '012_news', '013_organizer_analytics_payments', '014_org_references', '015_event_pages', '016_org_sales', '017_org_finance_stats', '018_admin_management', '019_support_threads', '020_organizer_pages_calendar', '021_free_tickets', '022_event_links', '023_organizer_signup', '024_event_creation', '025_promo_checkout', '026_publication', '027_admin_clients'];
const concurrency = ['002_concurrency', '003_concurrency', '005_concurrency'];

const server = new EmbeddedPostgres({ databaseDir: DIR, user: 'postgres', password: 'pw', port: PORT, persistent: false, onLog: () => {}, onError: () => {} });
await server.initialise(); await server.start(); await server.createDatabase('sun');
const url = `postgresql://postgres:pw@localhost:${PORT}/sun`;
const c = new pg.Client({ connectionString: url }); await c.connect();
c.on('notice', () => {});

// --- Environnement Supabase simulé ---
await c.query(`
 create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
 create schema auth;
 create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', email_confirmed_at timestamptz, created_at timestamptz default now(), last_sign_in_at timestamptz, banned_until timestamptz);
 create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade);
 create function auth.uid() returns uuid language sql stable as $$
   select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub','')::uuid $$;
 grant usage on schema public, auth to anon, authenticated, service_role;
 grant execute on function auth.uid() to anon, authenticated, service_role;
 -- droits par défaut de Supabase sur le schéma public (à révoquer explicitement par les migrations)
 alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
 alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
 alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`);

let failed = false;
async function file(label, p) {
  process.stdout.write(`${label} … `);
  try { await c.query(fs.readFileSync(R + p, 'utf8')); console.log('OK'); }
  catch (e) { failed = true; console.log('ÉCHEC :', e.message, e.where ? '\n     ' + e.where : ''); try { await c.query('rollback'); } catch {} }
}
for (const m of migrations) await file('migration ' + m, 'migrations/' + m);
for (const t of sqlTests) await file('test ' + t, 'tests/' + t + '.sql');
for (const t of concurrency) {
  process.stdout.write(`concurrence ${t} (base jetable) … `);
  const r = spawnSync('node', [R + 'tests/' + t + '.mjs'], { env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' });
  const okLine = /ALL OK/.test(r.stdout || '');
  if (r.status === 0 && okLine) console.log('OK'); else { failed = true; console.log('ÉCHEC\n' + (r.stdout || '').slice(-600) + (r.stderr || '').slice(-400)); }
}
await c.end(); await server.stop();
fs.rmSync(DIR, { recursive: true, force: true });
console.log(failed ? '\nRÉSULTAT : ÉCHEC' : '\nRÉSULTAT : TOUT PASSE');
process.exit(failed ? 1 : 0);
