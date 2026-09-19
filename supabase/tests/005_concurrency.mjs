// =====================================================================
// Concurrence — phase 5 : scans simultanés. BASE DE TEST UNIQUEMENT.
//   cd supabase/tests && npm i --no-save pg && DATABASE_URL="postgresql://…" node 005_concurrency.mjs
// =====================================================================
import pg from 'pg';
const URL = process.env.DATABASE_URL;
if (!URL) { console.error('DATABASE_URL manquante.'); process.exit(2); }
const pool = new pg.Pool({ connectionString: URL, max: 60 });
const SLUG = 'conc5-test-' + Math.random().toString(36).slice(2, 8);
const STAFF = '57c50000-0000-4000-8000-000000000057';
let failed = false;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) failed = true; };
const tally = (xs) => xs.reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {});
async function cleanup() {
  await pool.query(`delete from public.tickets where ticketed_event_id in (select id from public.ticketed_events where event_slug like 'conc5-test-%')`);
  await pool.query(`delete from public.order_items where order_id in (select id from public.orders where event_slug like 'conc5-test-%')`);
  await pool.query(`delete from public.orders where event_slug like 'conc5-test-%'`);
  await pool.query(`delete from public.ticket_tiers where ticketed_event_id in (select id from public.ticketed_events where event_slug like 'conc5-test-%')`);
  await pool.query(`delete from public.ticketed_events where event_slug like 'conc5-test-%'`);
  await pool.query(`delete from auth.users where email = 'conc5-staff@test.local'`);
}
const scan = async (code, ev) => (await pool.query('select * from public.scan_ticket($1,$2,$3)', [code, ev, STAFF])).rows[0];
try {
  await cleanup();
  await pool.query(`insert into auth.users (id, email) values ($1, 'conc5-staff@test.local')`, [STAFF]);
  await pool.query(`update public.profiles set role = 'staff' where id = $1`, [STAFF]);
  const ev = (await pool.query(`insert into public.ticketed_events (event_slug, starts_at, capacity, ticketing_enabled, status) values ($1, now() + interval '2 days', 1000, true, 'published') returning id`, [SLUG])).rows[0].id;
  const tier = (await pool.query(`insert into public.ticket_tiers (ticketed_event_id, name, price_cents, quantity_total) values ($1,'T',1000,1000) returning id`, [ev])).rows[0].id;
  const order = (await pool.query(`insert into public.orders (ticketed_event_id, event_slug, status, buyer_email, paid_at) values ($1,$2,'paid','c@test.local', now()) returning id`, [ev, SLUG])).rows[0].id;
  const item = (await pool.query(`insert into public.order_items (order_id, tier_id, quantity, unit_price_cents, participants, event_title, event_starts_at, tier_name)
     select $1,$2,1,1000,'[{"first_name":"a","last_name":"b"}]', 'T', now(), 'T'`, [order, tier])).rows;
  const itemId = (await pool.query('select id from public.order_items where order_id = $1', [order])).rows[0].id;
  // pour respecter order_items.quantity = participants, un item par billet
  const mk = async (code) => { const o = (await pool.query(`insert into public.orders (ticketed_event_id, event_slug, status, buyer_email, paid_at) values ($1,$2,'paid','c@test.local', now()) returning id`, [ev, SLUG])).rows[0].id;
    const i = (await pool.query(`insert into public.order_items (order_id, tier_id, quantity, unit_price_cents, participants, event_title, event_starts_at, tier_name) values ($1,$2,1,1000,'[{"first_name":"a","last_name":"b"}]','T',now(),'T') returning id`, [o, tier])).rows[0].id;
    await pool.query(`insert into public.tickets (order_id, order_item_id, ticketed_event_id, tier_id, code) values ($1,$2,$3,$4,$5)`, [o, i, ev, tier, code]); };
  await mk('SAME-CODE');
  for (let i = 0; i < 60; i++) await mk('DIFF-' + i);

  const rs = await Promise.all(Array.from({ length: 50 }, () => scan('SAME-CODE', ev)));
  const tl = tally(rs.map((r) => r.result));
  const times = new Set(rs.filter((r) => r.result === 'already_used').map((r) => String(r.used_at)));
  const validAt = String(rs.find((r) => r.result === 'valid')?.used_at);
  console.log('\nA — 50 scans simultanés du MÊME billet :', tl);
  ok(tl.valid === 1, `exactement 1 « VALIDE » (obtenu ${tl.valid ?? 0})`);
  ok(tl.already_used === 49, `49 « DÉJÀ SCANNÉ » (obtenu ${tl.already_used ?? 0})`);
  ok(times.size === 1 && times.has(validAt), 'tous les « déjà scanné » indiquent l\'heure du PREMIER scan');
  const n = (await pool.query(`select count(*)::int as n from public.tickets where code = 'SAME-CODE' and status = 'used'`)).rows[0].n;
  ok(n === 1, 'base : billet marqué utilisé une seule fois');

  const rb = await Promise.all(Array.from({ length: 60 }, (_, i) => scan('DIFF-' + i, ev)));
  ok(rb.every((r) => r.result === 'valid'), `B — 60 billets différents scannés en parallèle : tous « VALIDE » (${tally(rb.map((r) => r.result)).valid ?? 0}/60)`);
  const st = (await pool.query('select * from public.scan_stats($1)', [ev])).rows[0];
  ok(st.entered === 61 && st.sold === 61, `compteur : ${st.entered} entrés / ${st.sold} vendus (attendu 61 / 61)`);
} catch (e) { console.error('ERREUR du test :', e); failed = true; }
finally { await cleanup().catch((e) => console.error('nettoyage :', e.message)); await pool.end(); }
console.log(failed ? '\nÉCHEC' : '\nALL OK — un billet ne passe qu\'une fois, même sous scans simultanés');
process.exit(failed ? 1 : 0);
