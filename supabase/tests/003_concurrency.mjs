// =====================================================================
// Concurrence — phase 3 : rejeux parallèles du webhook et paiements tardifs.
// BASE DE TEST UNIQUEMENT (écrit puis supprime des données) :
//   cd supabase/tests && npm i --no-save pg
//   DATABASE_URL="postgresql://…" node 003_concurrency.mjs
// =====================================================================
import pg from 'pg';
const URL = process.env.DATABASE_URL;
if (!URL) { console.error('DATABASE_URL manquante.'); process.exit(2); }
const pool = new pg.Pool({ connectionString: URL, max: 40 });
const SLUG = 'conc3-test-' + Math.random().toString(36).slice(2, 8);
const uid = (i) => `c3c30000-0000-4000-8000-${String(i).padStart(12, '0')}`;
let failed = false;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) failed = true; };
const tally = (xs) => xs.reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {});
const parts = (n) => Array.from({ length: n }, (_, k) => ({ first_name: 'P', last_name: String(k) }));

async function reserve(userId, tierId, qty) {
  const r = await pool.query(`select order_id from public.reserve_tickets($1,$2,'Test',$3::jsonb,'{"email":"c@test.local"}'::jsonb,0,0,'v',true)`,
    [SLUG, userId, JSON.stringify([{ tier_id: tierId, quantity: qty, participants: parts(qty) }])]);
  return r.rows[0].order_id;
}
async function ticketsFor(orderId) {
  const it = await pool.query('select id, quantity from public.order_items where order_id = $1', [orderId]);
  const t = [];
  for (const row of it.rows) for (let g = 1; g <= row.quantity; g++)
    t.push({ id: crypto.randomUUID(), order_item_id: row.id, code: 'C3' + crypto.randomUUID().replace(/-/g, ''), first_name: 'P', last_name: String(g) });
  return t;
}
const fulfill = async (orderId, total) => (await pool.query('select public.fulfill_order($1,$2,$3,$4,$5::jsonb) as r',
  [orderId, 'cs_' + orderId, 'pi_' + orderId, total, JSON.stringify(await ticketsFor(orderId))])).rows[0].r;
async function cleanup() {
  await pool.query(`delete from public.tickets where ticketed_event_id in (select id from public.ticketed_events where event_slug like 'conc3-test-%')`);
  await pool.query(`delete from public.order_items where order_id in (select id from public.orders where event_slug like 'conc3-test-%')`);
  await pool.query(`delete from public.orders where event_slug like 'conc3-test-%'`);
  await pool.query(`delete from public.ticket_tiers where ticketed_event_id in (select id from public.ticketed_events where event_slug like 'conc3-test-%')`);
  await pool.query(`delete from public.ticketed_events where event_slug like 'conc3-test-%'`);
  await pool.query(`delete from public.stripe_events where id like 'evt_conc3_%'`);
  await pool.query(`delete from auth.users where email like 'conc3%@test.local'`);
}
try {
  await cleanup();
  await pool.query(`insert into auth.users (id, email) select ('c3c30000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'conc3' || g || '@test.local' from generate_series(1, 30) g`);
  const ev = (await pool.query(`insert into public.ticketed_events (event_slug, starts_at, capacity, ticketing_enabled, status)
     values ($1, now() + interval '30 days', 1000, true, 'published') returning id`, [SLUG])).rows[0].id;
  const tier = async (name, qty) => (await pool.query(`insert into public.ticket_tiers (ticketed_event_id, name, price_cents, quantity_total, max_per_order)
     values ($1,$2,1000,$3,20) returning id`, [ev, name, qty])).rows[0].id;

  // --- A : 20 livraisons simultanées du MÊME webhook ------------------------
  const tA = await tier('A', 50);
  const o = await reserve(uid(1), tA, 3);
  const res = await Promise.all(Array.from({ length: 20 }, () => fulfill(o, 3000)));
  const tl = tally(res);
  const n = (await pool.query('select count(*)::int as n from public.tickets where order_id = $1', [o])).rows[0].n;
  console.log('\nA — 20 confirmations simultanées de la même commande :', tl);
  ok(tl.fulfilled === 1, `une seule confirmation effective (obtenu ${tl.fulfilled ?? 0})`);
  ok(tl.already_paid === 19, `19 rejeux ignorés (obtenu ${tl.already_paid ?? 0})`);
  ok(n === 3, `exactement 3 billets créés (obtenu ${n})`);

  // --- B : 10 paiements tardifs simultanés, 3 places -------------------------
  const tB = await tier('B', 10);
  const orders = [];
  for (let i = 0; i < 10; i++) orders.push(await reserve(uid(10 + i), tB, 1));
  await pool.query(`update public.orders set expires_at = now() - interval '1 minute' where id = any($1)`, [orders]);   // toutes périmées
  await pool.query(`update public.ticket_tiers set quantity_total = 3 where id = $1`, [tB]);
  const rb = await Promise.all(orders.map((id) => fulfill(id, 1000)));
  const tb = tally(rb);
  const sold = (await pool.query(`select count(*)::int as n from public.tickets where tier_id = $1 and status in ('valid','used')`, [tB])).rows[0].n;
  const lost = (await pool.query(`select count(*)::int as n from public.orders where id = any($1) and status = 'cancelled'`, [orders])).rows[0].n;
  console.log('\nB — 10 paiements tardifs simultanés pour 3 places :', tb);
  ok(tb.fulfilled === 3, `exactement 3 confirmées (obtenu ${tb.fulfilled ?? 0})`);
  ok(tb.stock_lost === 7, `7 « stock perdu » à rembourser (obtenu ${tb.stock_lost ?? 0})`);
  ok(sold === 3, `base : ${sold} billets pour 3 places — jamais de survente`);
  ok(lost === 7, `base : ${lost} commandes annulées (payment_intent conservé pour le remboursement)`);

  // --- C : événement Stripe déjà traité, 20 rejeux simultanés ----------------
  await pool.query(`select public.claim_stripe_event('evt_conc3_1','checkout.session.completed')`);
  await pool.query(`select public.finish_stripe_event('evt_conc3_1', true)`);
  const rc = await Promise.all(Array.from({ length: 20 }, async () => (await pool.query(`select public.claim_stripe_event('evt_conc3_1','checkout.session.completed') as r`)).rows[0].r));
  const tc = tally(rc);
  console.log('\nC — 20 rejeux d\'un événement Stripe traité :', tc);
  ok(tc.duplicate === 20, `20 doublons ignorés (obtenu ${tc.duplicate ?? 0})`);
} catch (e) { console.error('ERREUR du test :', e); failed = true; }
finally { await cleanup().catch((e) => console.error('nettoyage :', e.message)); await pool.end(); }
console.log(failed ? '\nÉCHEC' : '\nALL OK — idempotence et anti-survente sous concurrence');
process.exit(failed ? 1 : 0);
