// =====================================================================
// Test de concurrence — phase 2 : N connexions RÉELLES appellent
// reserve_tickets en même temps. Prouve l'absence de survente.
//
// Usage (sur une base de TEST — ce script écrit et supprime des données) :
//   cd supabase/tests && npm i --no-save pg
//   DATABASE_URL="postgresql://postgres:...@db.xxx.supabase.co:5432/postgres" node 002_concurrency.mjs
//
// Il crée des utilisateurs / un événement préfixés « conc-test », puis
// supprime tout à la fin (même en cas d'échec). Ne le lance PAS sur la base
// de production : utilise un projet Supabase de test ou une base locale.
// =====================================================================
import pg from 'pg';

const URL = process.env.DATABASE_URL;
if (!URL) { console.error('DATABASE_URL manquante.'); process.exit(2); }
const N = Number(process.env.CONC_N || 50);
const PLACES = Number(process.env.CONC_PLACES || 10);

const pool = new pg.Pool({ connectionString: URL, max: N + 2 });
const uid = (i) => `c0c00000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const SLUG = 'conc-test-' + Math.random().toString(36).slice(2, 8);
let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`); if (!cond) failed = true; };

async function reserve(slug, userId, tierId, qty) {
  const c = await pool.connect();
  try {
    const parts = Array.from({ length: qty }, (_, k) => ({ first_name: 'P', last_name: String(k) }));
    await c.query(
      `select * from public.reserve_tickets($1, $2, 'Test', $3::jsonb,
         '{"email":"c@test.local","first_name":"C","last_name":"C","phone":"0"}'::jsonb, 0, 0, 'v', true)`,
      [slug, userId, JSON.stringify([{ tier_id: tierId, quantity: qty, participants: parts }])],
    );
    return { ok: true };
  } catch (e) { return { ok: false, code: e.message }; }
  finally { c.release(); }
}
async function reserveMulti(slug, userId, items) {
  const c = await pool.connect();
  try {
    const arr = items.map(([tier_id, quantity]) => ({
      tier_id, quantity, participants: Array.from({ length: quantity }, (_, k) => ({ first_name: 'P', last_name: String(k) })),
    }));
    await c.query(
      `select * from public.reserve_tickets($1, $2, 'Test', $3::jsonb,
         '{"email":"c@test.local"}'::jsonb, 0, 0, 'v', true)`, [slug, userId, JSON.stringify(arr)]);
    return { ok: true };
  } catch (e) { return { ok: false, code: e.message }; }
  finally { c.release(); }
}
const tally = (rs) => rs.reduce((m, r) => { const k = r.ok ? 'OK' : r.code; m[k] = (m[k] || 0) + 1; return m; }, {});

async function setup() {
  await pool.query(`insert into auth.users (id, email)
    select ('c0c00000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'conc' || g || '@test.local'
    from generate_series(1, $1) g on conflict do nothing`, [N * 2]);
  const ev = await pool.query(`insert into public.ticketed_events (event_slug, starts_at, capacity, ticketing_enabled, status)
    values ($1, now() + interval '30 days', 1000, true, 'published') returning id`, [SLUG]);
  const evId = ev.rows[0].id;
  const t = (name, qty) => pool.query(`insert into public.ticket_tiers (ticketed_event_id, name, price_cents, quantity_total, max_per_order)
    values ($1, $2, 1000, $3, 20) returning id`, [evId, name, qty]).then((r) => r.rows[0].id);
  return { evId, t };
}
async function cleanup() {
  await pool.query(`delete from public.order_items where order_id in (select id from public.orders where event_slug like 'conc-test-%')`);
  await pool.query(`delete from public.orders where event_slug like 'conc-test-%'`);
  await pool.query(`delete from public.ticket_tiers where ticketed_event_id in (select id from public.ticketed_events where event_slug like 'conc-test-%')`);
  await pool.query(`delete from public.ticketed_events where event_slug like 'conc-test-%'`);
  await pool.query(`delete from auth.users where email like 'conc%@test.local'`);
}
const pending = (evId) => pool.query(
  `select coalesce(sum(oi.quantity),0)::int as n, count(distinct o.id)::int as orders
     from public.orders o join public.order_items oi on oi.order_id = o.id
    where o.ticketed_event_id = $1 and o.status = 'pending' and o.expires_at > now()`, [evId]).then((r) => r.rows[0]);

try {
  await cleanup();
  const { evId, t } = await setup();

  // --- Scénario 1 : N acheteurs (1 place) sur un tarif de PLACES places -----
  const tier = await t('Scénario 1', PLACES);
  let rs = await Promise.all(Array.from({ length: N }, (_, i) => reserve(SLUG, uid(i + 1), tier, 1)));
  let tl = tally(rs), p = await pending(evId);
  console.log(`\nScénario 1 — ${N} appels parallèles, ${PLACES} places :`, tl);
  ok(tl.OK === PLACES, `exactement ${PLACES} réservations réussies (obtenu ${tl.OK ?? 0})`);
  ok(tl.SOLD_OUT_TIER === N - PLACES, `${N - PLACES} refus SOLD_OUT_TIER (obtenu ${tl.SOLD_OUT_TIER ?? 0})`);
  ok(Object.keys(tl).every((k) => ['OK', 'SOLD_OUT_TIER'].includes(k)), 'aucune autre erreur (pas d\'interblocage)');
  ok(p.n === PLACES && p.orders === PLACES, `base : ${p.n} places réservées / ${p.orders} commandes pending (attendu ${PLACES})`);

  // --- Scénario 2 : commandes de 2 places, 10 restantes → 5 ----------------
  await pool.query(`update public.orders set status = 'expired' where ticketed_event_id = $1`, [evId]);
  rs = await Promise.all(Array.from({ length: N }, (_, i) => reserve(SLUG, uid(i + 1), tier, 2)));
  tl = tally(rs); p = await pending(evId);
  console.log(`\nScénario 2 — commandes de 2 places :`, tl);
  ok(tl.OK === PLACES / 2, `exactement ${PLACES / 2} réservations de 2 places (obtenu ${tl.OK ?? 0})`);
  ok(p.n === PLACES, `base : ${p.n} places réservées (jamais plus de ${PLACES})`);

  // --- Scénario 3 : 2 tarifs de PLACES places chacun mais événement à PLACES ---
  await pool.query(`update public.orders set status = 'expired' where ticketed_event_id = $1`, [evId]);
  await pool.query(`update public.ticketed_events set capacity = $2 where id = $1`, [evId, PLACES]);
  const tierB = await t('Scénario 3 B', PLACES);
  rs = await Promise.all(Array.from({ length: N }, (_, i) => reserve(SLUG, uid(i + 1), i % 2 ? tier : tierB, 1)));
  tl = tally(rs); p = await pending(evId);
  console.log(`\nScénario 3 — 2 tarifs, capacité de l'événement = ${PLACES} :`, tl);
  ok(tl.OK === PLACES, `exactement ${PLACES} réservations toutes tarifs confondus (obtenu ${tl.OK ?? 0})`);
  ok(p.n === PLACES, `base : ${p.n} places réservées (capacité événement respectée)`);
  ok(tl.SOLD_OUT_EVENT > 0 || tl.SOLD_OUT_TIER > 0, 'refus dus à la capacité');

  // --- Scénario 4 : même client x N onglets → une seule réservation active ----
  await pool.query(`update public.orders set status = 'expired' where ticketed_event_id = $1`, [evId]);
  await pool.query(`update public.ticketed_events set capacity = 1000 where id = $1`, [evId]);
  const tierC = await t('Scénario 4', 1000);
  rs = await Promise.all(Array.from({ length: 20 }, () => reserve(SLUG, uid(1), tierC, 3)));
  tl = tally(rs);
  const pc = await pool.query(`select count(*)::int as n, coalesce(sum(oi.quantity),0)::int as q
      from public.orders o join public.order_items oi on oi.order_id = o.id
     where o.user_id = $1 and o.ticketed_event_id = $2 and o.status = 'pending' and o.expires_at > now()`, [uid(1), evId]);
  console.log(`\nScénario 4 — 20 onglets du même client :`, tl);
  ok(pc.rows[0].n === 1 && pc.rows[0].q === 3, `une seule réservation active (${pc.rows[0].n} commande, ${pc.rows[0].q} places)`);
} catch (e) {
  console.error('ERREUR du test :', e);
  failed = true;
} finally {
  await cleanup().catch((e) => console.error('nettoyage :', e.message));
  await pool.end();
}
console.log(failed ? '\nÉCHEC' : '\nALL OK — aucune survente sous concurrence');
process.exit(failed ? 1 : 0);
