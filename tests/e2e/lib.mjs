import pg from 'pg';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
const require = createRequire(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json'));
const Stripe = require('stripe');
const OFF = Number(process.env.E2E_OFFSET || 0);
export const BASE = `http://localhost:${3130 + OFF}`;
export const STRIPE = `http://127.0.0.1:${54332 + OFF}`, MAIL = `http://127.0.0.1:${54333 + OFF}`;
export const USERS = {
  cust:  { id: 'c1000000-0000-4000-8000-000000000001', email: 'cust@test.local',  password: 'Passw0rd!' },
  cust2: { id: 'c2000000-0000-4000-8000-000000000002', email: 'cust2@test.local', password: 'Passw0rd!' },
  admin: { id: 'ad000000-0000-4000-8000-0000000000ad', email: 'admin@test.local', password: 'Passw0rd!' },
  deleg: { id: 'de000000-0000-4000-8000-0000000000de', email: 'deleg@test.local', password: 'Passw0rd!' },
  orgb:  { id: '0b000000-0000-4000-8000-0000000000b2', email: 'orgb@test.local',  password: 'Passw0rd!' },
  staff: { id: '57000000-0000-4000-8000-000000000057', email: 'staff@test.local', password: 'Passw0rd!' },
};
export const db = new pg.Client({ connectionString: `postgresql://postgres:pw@localhost:${54329 + OFF}/main` });
await db.connect();
export const q = async (sql, params) => (await db.query(sql, params)).rows;
export const one = async (sql, params) => (await q(sql, params))[0];

let fails = 0, oks = 0;
export const ok = (cond, msg) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`); cond ? oks++ : fails++; };
export const summary = (title) => { console.log(`\n${fails ? 'ÉCHEC' : 'ALL OK'} — ${title} : ${oks} contrôles OK, ${fails} en échec`); return fails; };
export const section = (t) => console.log(`\n— ${t}`);

// ---- client HTTP avec cookies
export class Client {
  constructor() { this.jar = {}; }
  cookieHeader() { return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; '); }
  async req(path, { method = 'GET', body, headers = {}, raw = false, redirect = 'manual' } = {}) {
    const h = { ...headers }; if (this.cookieHeader()) h.cookie = this.cookieHeader();
    if (body !== undefined && !raw) { h['content-type'] ||= 'application/json'; }
    const res = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : raw ? body : JSON.stringify(body), redirect });
    for (const c of res.headers.getSetCookie?.() ?? []) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (/max-age=0|expires=thu, 01 jan 1970/i.test(c) || v === '') delete this.jar[k]; else this.jar[k] = v; }
    let data = null; const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) data = await res.json().catch(() => null); else if (raw !== 'buffer') data = await res.text();
    return { status: res.status, data, headers: res.headers, res };
  }
  async login(user) { const r = await this.req('/api/auth/login', { method: 'POST', body: { email: user.email, password: user.password } }); if (r.status !== 200) throw new Error('login KO ' + user.email + ' ' + JSON.stringify(r.data)); return this; }
}
export const as = async (u) => new Client().login(u);

// ---- webhooks Stripe signés (offline)
const stripe = new Stripe('sk_test_e2e');
let evn = 0;
export async function webhook(type, object, { id, sigOverride, secret = 'whsec_e2e_secret' } = {}) {
  const event = { id: id ?? `evt_e2e_${Date.now()}_${++evn}`, object: 'event', api_version: '2025-01-01', created: Math.floor(Date.now() / 1000), type, data: { object }, livemode: false, pending_webhooks: 1, request: { id: null, idempotency_key: null } };
  const payload = JSON.stringify(event);
  const sig = sigOverride === undefined ? stripe.webhooks.generateTestHeaderString({ payload, secret }) : sigOverride;
  const headers = { 'content-type': 'application/json' }; if (sig !== null) headers['stripe-signature'] = sig;
  const res = await fetch(BASE + '/api/stripe/webhook', { method: 'POST', headers, body: payload });
  return { status: res.status, data: await res.json().catch(() => null), eventId: event.id };
}
export const sessionCompleted = (order, o = {}) => ({ id: o.session ?? order.stripe_checkout_session_id ?? 'cs_x', object: 'checkout.session', client_reference_id: order.id, payment_status: 'paid', amount_total: order.total_cents, payment_intent: o.pi ?? 'pi_' + order.id, metadata: { order_id: order.id }, ...o.extra });

export const stripeState = async () => (await fetch(STRIPE + '/__state')).json();
export const authState = async (reset = false) => (await fetch(`http://127.0.0.1:${54330 + OFF}/__auth${reset ? '?reset=1' : ''}`)).json();
export const mailState = async () => (await fetch(MAIL + '/__state')).json();
export const resetMocks = async () => { await fetch(STRIPE + '/__reset'); await fetch(MAIL + '/__reset'); };

export async function resetDb() {
  await q(`truncate public.audit_log, public.refunds, public.stripe_events, public.tickets, public.order_items, public.orders, public.ticket_tiers, public.ticketed_events restart identity cascade`);
  await q(`update public.app_settings set value = '"bizouk"' where key = 'ticketing_mode'`);
  await q(`update public.app_settings set value = '0' where key in ('fee_percent','fee_fixed_cents')`);
  await q(`update public.profiles set phone = '0690111111' where id = $1`, [USERS.cust.id]);
  await resetMocks();
}
const future = (days, h = 20) => { const d = new Date(Date.now() + days * 864e5); d.setUTCHours(h + 4, 0, 0, 0); return d.toISOString().replace('.000Z', '+00:00'); };
export { future };
export async function setupEvent(admin, { slug = 'la-nuit-des-ombres', capacity = 100, tiers } = {}) {
  let r = await admin.req('/api/billetterie/admin/settings', { method: 'PATCH', body: { key: 'ticketing_mode', value: 'native' } });
  if (r.status !== 200) throw new Error('settings ' + JSON.stringify(r.data));
  r = await admin.req(`/api/billetterie/admin/events/${slug}`, { method: 'PUT', body: { starts_at: future(30), ends_at: null, doors_open_at: null, venue_name: 'Salle des Fêtes', venue_address: '1 rue du Test, Pointe-à-Pitre', capacity, sales_open_at: null, sales_close_at: null, ticketing_enabled: true, status: 'published' } });
  if (r.status !== 200) throw new Error('event ' + JSON.stringify(r.data));
  const ids = {};
  for (const t of tiers ?? [{ key: 'std', name: 'Standard', price_cents: 1500, quantity_total: 10, max_per_order: 4 }, { key: 'early', name: 'Early', price_cents: 1000, quantity_total: 5, max_per_order: 5 }]) {
    r = await admin.req(`/api/billetterie/admin/events/${slug}/tiers`, { method: 'PUT', body: { id: null, description: '', sales_start: null, sales_end: null, is_active: true, sort_order: 0, ...t, key: undefined } });
    if (r.status !== 200) throw new Error('tier ' + JSON.stringify(r.data));
    ids[t.key] = r.data.id;
  }
  return ids;
}
export const people = (n, p = 'Part') => Array.from({ length: n }, (_, i) => ({ first_name: p + i, last_name: 'Nom' + i }));
export const checkoutBody = (slug, items, over = {}) => ({ slug, items: items.map(([tier_id, quantity]) => ({ tier_id, quantity, participants: people(quantity) })), accept_terms: true, guardian_consent: true, ...over });

// ---- JWT client (même secret que la passerelle) pour tester la RLS à travers PostgREST
import crypto from 'crypto';
const JWT = 'e2e-jwt-secret-e2e-jwt-secret-e2e-jwt-secret';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export const jwtFor = (claims) => { const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims }); return `${h}.${p}.${crypto.createHmac('sha256', JWT).update(`${h}.${p}`).digest('base64url')}`; };
export const ANON_KEY = jwtFor({ role: 'anon', iss: 'e2e' });
export const userJwt = (u) => jwtFor({ sub: u.id, role: 'authenticated', aud: 'authenticated', email: u.email });
export async function rest(path, { method = 'GET', token = ANON_KEY, body, headers = {} } = {}) {
  const r = await fetch(`http://127.0.0.1:${54330 + OFF}/rest/v1` + path, { method, headers: { apikey: ANON_KEY, authorization: 'Bearer ' + token, 'content-type': 'application/json', prefer: 'return=representation', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
}
export const legacyAdminCookie = () => 'sun_admin=' + crypto.createHash('sha256').update('e2e-admin').digest('hex');
