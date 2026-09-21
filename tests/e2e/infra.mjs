// Banc d'essai de bout en bout : Postgres réel + PostgREST réel + faux GoTrue + faux Stripe
// + faux Resend, puis l'app Next.js réelle devant. Reste actif jusqu'à SIGTERM.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import http from 'http';
import fs from 'fs';
import crypto from 'crypto';
import { spawn } from 'child_process';

import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const POSTGREST = process.env.POSTGREST_BIN || path.join(HERE, '.bin', 'postgrest');
// E2E_OFFSET décale tous les ports : deux bancs (deux sessions de travail) peuvent tourner en même temps.
const OFF = Number(process.env.E2E_OFFSET || 0);
const PORTS = { pg: 54329 + OFF, rest: 54331 + OFF, gw: 54330 + OFF, stripe: 54332 + OFF, resend: 54333 + OFF, next: 3130 + OFF };
export const JWT_SECRET = 'e2e-jwt-secret-e2e-jwt-secret-e2e-jwt-secret';
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
export const sign = (payload) => { const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64(payload); return `${h}.${p}.${crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`; };
function verify(tok) { const [h, p, s] = (tok || '').split('.'); if (!s) return null; const e = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url'); if (e !== s) return null; const d = JSON.parse(Buffer.from(p, 'base64url')); return d.exp && d.exp < Date.now() / 1000 ? null : d; }
const far = Math.floor(Date.now() / 1000) + 86400 * 30;
const ANON = sign({ role: 'anon', iss: 'e2e', exp: far }), SERVICE = sign({ role: 'service_role', iss: 'e2e', exp: far });

// ---------- comptes fictifs (GoTrue simulé)
export const USERS = {
  cust:  { id: 'c1000000-0000-4000-8000-000000000001', email: 'cust@test.local',  password: 'Passw0rd!', role: 'customer', first: 'Camille', last: 'Client', phone: '0690111111' },
  cust2: { id: 'c2000000-0000-4000-8000-000000000002', email: 'cust2@test.local', password: 'Passw0rd!', role: 'customer', first: 'Denis',   last: 'Autre',  phone: '0690222222' },
  admin: { id: 'ad000000-0000-4000-8000-0000000000ad', email: 'admin@test.local', password: 'Passw0rd!', role: 'admin',    first: 'Alex',    last: 'Admin',  phone: '0690333333' },
  staff: { id: '57000000-0000-4000-8000-000000000057', email: 'staff@test.local', password: 'Passw0rd!', role: 'staff',    first: 'Sam',     last: 'Porte',  phone: '0690444444' },
  orgb:  { id: '0b000000-0000-4000-8000-0000000000b2', email: 'orgb@test.local',  password: 'Passw0rd!', role: 'customer', first: 'Olivia',  last: 'Autre-Orga', phone: '0690555555' },
};
const userJson = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
const session = (u) => { const exp = Math.floor(Date.now() / 1000) + 3600; return { access_token: sign({ sub: u.id, role: 'authenticated', aud: 'authenticated', email: u.email, exp }), token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'rt_' + u.id, user: userJson(u) }; };

const read = (req) => new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)); };

// ---------- faux Stripe
export const stripeState = { sessions: {}, refunds: [], idem: {}, failRefund: false, n: 0, accounts: {}, links: [] };
function parseForm(s) { const o = {}; for (const [k, v] of new URLSearchParams(s)) o[k] = v; return o; }
const stripeSrv = http.createServer(async (req, res) => {
  const body = (await read(req)).toString(); const u = new URL(req.url, 'http://x'); const f = parseForm(body);
  if (u.pathname === '/__state') return json(res, 200, stripeState);
  if (u.pathname === '/__reset') { Object.assign(stripeState, { sessions: {}, refunds: [], idem: {}, failRefund: false, accounts: {}, links: [] }); return json(res, 200, {}); }
  // comptes connectés (Connect Express) : création, lecture, liens d'inscription et de tableau de bord ; /__account?id=&ready=1 simule la validation par Stripe
  if (u.pathname === '/__account') { const a = stripeState.accounts[u.searchParams.get('id')]; if (a) { const on = u.searchParams.get('ready') === '1'; Object.assign(a, { charges_enabled: on, payouts_enabled: on, details_submitted: on }); } return json(res, 200, a ?? {}); }
  if (u.pathname === '/v1/accounts' && req.method === 'POST') {
    const key = req.headers['idempotency-key'];
    if (key && stripeState.idem[key]) return json(res, 200, stripeState.idem[key]);
    const a = { id: 'acct_test' + (++stripeState.n) + crypto.randomBytes(3).toString('hex'), object: 'account', type: f.type, country: f.country, email: f.email, charges_enabled: false, payouts_enabled: false, details_submitted: false, params: f };
    stripeState.accounts[a.id] = a; if (key) stripeState.idem[key] = a; return json(res, 200, a);
  }
  let am = u.pathname.match(/^\/v1\/accounts\/([^/]+)$/); if (am && req.method === 'GET') { const a = stripeState.accounts[am[1]]; return a ? json(res, 200, a) : json(res, 404, { error: { message: 'No such account' } }); }
  if (u.pathname === '/v1/account_links' && req.method === 'POST') { stripeState.links.push(f); return json(res, 200, { object: 'account_link', url: `http://stripe.mock/onboard/${f.account}` }); }
  am = u.pathname.match(/^\/v1\/accounts\/([^/]+)\/login_links$/); if (am && req.method === 'POST') return json(res, 200, { object: 'login_link', url: `http://stripe.mock/dashboard/${am[1]}` });
  if (u.pathname === '/__fail') { stripeState.failRefund = u.searchParams.get('on') === '1'; return json(res, 200, {}); }
  if (u.pathname === '/v1/checkout/sessions' && req.method === 'POST') {
    const lines = []; for (const [k, v] of Object.entries(f)) { const m = k.match(/^line_items\[(\d+)\]\[(price_data\]\[unit_amount|quantity|price_data\]\[product_data\]\[name)\]?$/); if (m) { const i = +m[1]; lines[i] ||= {}; if (k.endsWith('[unit_amount]')) lines[i].unit = +v; else if (k.endsWith('[quantity]')) lines[i].qty = +v; else lines[i].name = v; } }
    const id = 'cs_test_' + (++stripeState.n) + crypto.randomBytes(3).toString('hex');
    const s = { id, object: 'checkout.session', url: `http://stripe.mock/pay/${id}`, payment_status: 'unpaid', amount_total: lines.reduce((t, l) => t + l.unit * l.qty, 0), lines, params: f, idempotency: req.headers['idempotency-key'] };
    stripeState.sessions[id] = s; return json(res, 200, s);
  }
  let m = u.pathname.match(/^\/v1\/checkout\/sessions\/([^/]+)\/expire$/); if (m) { if (stripeState.sessions[m[1]]) stripeState.sessions[m[1]].expired = true; return json(res, 200, { id: m[1], status: 'expired' }); }
  if (u.pathname === '/v1/refunds' && req.method === 'POST') {
    const key = req.headers['idempotency-key'];
    if (key && stripeState.idem[key]) return json(res, 200, stripeState.idem[key]);
    if (stripeState.failRefund) return json(res, 500, { error: { type: 'api_error', message: 'boom (simulé)' } });
    const r = { id: 're_test_' + (stripeState.refunds.length + 1), object: 'refund', amount: +f.amount, payment_intent: f.payment_intent, status: 'succeeded', key };
    stripeState.refunds.push(r); if (key) stripeState.idem[key] = r; return json(res, 200, r);
  }
  json(res, 404, { error: { message: 'mock: ' + u.pathname } });
});

// ---------- faux Resend
export const mailState = { sent: [], fail: false };
const resendSrv = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__state') return json(res, 200, mailState);
  if (u.pathname === '/__reset') { mailState.sent = []; mailState.fail = false; return json(res, 200, {}); }
  if (u.pathname === '/__fail') { mailState.fail = u.searchParams.get('on') === '1'; return json(res, 200, {}); }
  if (u.pathname === '/emails' && req.method === 'POST') {
    const b = JSON.parse((await read(req)).toString());
    if (mailState.fail) return json(res, 422, { name: 'validation_error', message: 'The domain is not verified (simulé)', statusCode: 422 });
    mailState.sent.push(b); return json(res, 200, { id: 'em_' + mailState.sent.length });
  }
  json(res, 404, { message: 'mock' });
});

// ---------- passerelle « Supabase » : /rest/v1 → PostgREST, /auth/v1 → faux GoTrue
const gw = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/rest/v1/')) {
    const body = await read(req);
    const headers = { ...req.headers, host: `127.0.0.1:${PORTS.rest}` }; delete headers['content-length'];
    const p = http.request({ host: '127.0.0.1', port: PORTS.rest, path: u.pathname.replace('/rest/v1', '') + u.search, method: req.method, headers: { ...headers, 'content-length': body.length } }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    p.on('error', (e) => json(res, 502, { message: String(e) })); p.end(body); return;
  }
  if (u.pathname === '/auth/v1/user') { const d = verify((req.headers.authorization || '').replace(/^Bearer /, '')); const usr = d && Object.values(USERS).find((x) => x.id === d.sub); return usr ? json(res, 200, userJson(usr)) : json(res, 401, { code: 401, msg: 'invalid JWT' }); }
  if (u.pathname === '/auth/v1/token') {
    const b = JSON.parse((await read(req)).toString() || '{}'); const g = u.searchParams.get('grant_type');
    if (g === 'password') { const usr = Object.values(USERS).find((x) => x.email === b.email && x.password === b.password); return usr ? json(res, 200, session(usr)) : json(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }); }
    if (g === 'refresh_token') { const usr = Object.values(USERS).find((x) => 'rt_' + x.id === b.refresh_token); return usr ? json(res, 200, session(usr)) : json(res, 400, { code: 400, msg: 'bad refresh' }); }
  }
  if (u.pathname === '/auth/v1/logout') { await read(req); res.writeHead(204); return res.end(); }
  json(res, 404, { msg: 'gateway: ' + u.pathname });
});

async function listen(srv, port) { await new Promise((r) => srv.listen(port, '127.0.0.1', r)); }
const procs = [];
async function main() {
  const DIR = path.join(os.tmpdir(), 'sunshines-e2e-' + process.pid);
  const server = new EmbeddedPostgres({ databaseDir: DIR, user: 'postgres', password: 'pw', port: PORTS.pg, persistent: false });
  await server.initialise(); await server.start(); await server.createDatabase('main');
  const c = new pg.Client({ connectionString: `postgresql://postgres:pw@localhost:${PORTS.pg}/main` }); await c.connect();
  await c.query(`
   do $r$ begin
     begin create role anon nologin; exception when duplicate_object then null; end;
     begin create role authenticated nologin; exception when duplicate_object then null; end;
     begin create role service_role nologin bypassrls; exception when duplicate_object then null; end;
     begin create role authenticator noinherit login password 'pw'; exception when duplicate_object then null; end;
   end $r$;
   grant anon, authenticated, service_role to authenticator;
   create schema auth;
   create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', email_confirmed_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub','')::uuid $$;
   grant usage on schema public, auth to anon, authenticated, service_role;
   grant execute on function auth.uid() to anon, authenticated, service_role;
   alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
   alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
   alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`);
  for (const f of fs.readdirSync(ROOT + '/supabase/migrations').sort()) await c.query(fs.readFileSync(ROOT + '/supabase/migrations/' + f, 'utf8'));
  for (const u of Object.values(USERS)) {
    await c.query('insert into auth.users (id, email, email_confirmed_at) values ($1,$2, now())', [u.id, u.email]);
    await c.query('update public.profiles set first_name=$2, last_name=$3, phone=$4, role=$5 where id=$1', [u.id, u.first, u.last, u.phone, u.role]);
  }
  await c.end();
  console.log('[infra] base prête');

  const L = path.join(ROOT, 'node_modules', '@embedded-postgres', `${process.platform}-${process.arch}`, 'native', 'lib');
  const rest = spawn(POSTGREST, [], { env: { ...process.env, DYLD_LIBRARY_PATH: L, PGRST_DB_URI: `postgres://authenticator:pw@localhost:${PORTS.pg}/main`, PGRST_DB_SCHEMAS: 'public', PGRST_DB_ANON_ROLE: 'anon', PGRST_JWT_SECRET: JWT_SECRET, PGRST_SERVER_PORT: String(PORTS.rest), PGRST_SERVER_HOST: '127.0.0.1', PGRST_LOG_LEVEL: 'warn' }, stdio: ['ignore', 'pipe', 'pipe'] });
  rest.stderr.on('data', (d) => process.env.VERBOSE && process.stderr.write('[postgrest] ' + d)); procs.push(rest);
  await listen(stripeSrv, PORTS.stripe); await listen(resendSrv, PORTS.resend); await listen(gw, PORTS.gw);
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`http://127.0.0.1:${PORTS.rest}/app_settings?select=key`, { headers: { apikey: ANON, authorization: 'Bearer ' + ANON } }); if (r.ok) break; } catch {} await new Promise((r) => setTimeout(r, 300)); }
  console.log('[infra] PostgREST prêt');

  const env = { ...process.env, PORT: String(PORTS.next),
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${PORTS.gw}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE,
    STRIPE_SECRET_KEY: 'sk_test_e2e', STRIPE_API_MOCK: `127.0.0.1:${PORTS.stripe}`, STRIPE_WEBHOOK_SECRET: 'whsec_e2e_secret',
    TICKET_HMAC_SECRET: 'e2e-ticket-hmac-secret-e2e-ticket-hmac-secret', RESEND_API_KEY: 're_e2e', RESEND_BASE_URL: `http://127.0.0.1:${PORTS.resend}`,
    // .env.local (celui de l'utilisateur) peut définir TICKETING_FORCE_MODE : le banc doit pouvoir tester le mode Bizouk
    TICKETING_FORCE_MODE: '', MAIL_FROM: 'La Sunshines <billets@test.local>', NEXT_PUBLIC_SITE_URL: `http://localhost:${PORTS.next}`, ADMIN_PASSWORD: 'e2e-admin',
    // dossier de compilation PROPRE au banc : un `next dev` lancé à côté (port 3000…) partage sinon .next et les deux se corrompent
    NEXT_DIST_DIR: '.next-e2e' };
  delete env.KV_REST_API_URL;
  const next = spawn('npx', ['next', 'dev', '-p', String(PORTS.next)], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  next.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write('[next] ' + d)); next.stderr.on('data', (d) => process.env.VERBOSE && process.stderr.write('[next!] ' + d));
  fs.writeFileSync(HERE + '/next.log', ''); const lf = fs.createWriteStream(HERE + '/next.log'); next.stdout.pipe(lf); next.stderr.pipe(lf);
  procs.push(next);
  for (let i = 0; i < 90; i++) { try { const r = await fetch(`http://localhost:${PORTS.next}/api/status`); if (r.status < 500) break; } catch {} await new Promise((r) => setTimeout(r, 1000)); }
  fs.writeFileSync(HERE + '/READY', String(Date.now()));
  console.log('[infra] TOUT EST PRÊT');
  const stop = async () => { procs.forEach((p) => p.kill()); try { await server.stop(); } catch {} process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
fs.rmSync(HERE + '/READY', { force: true });
main().catch((e) => { console.error(e); process.exit(1); });
