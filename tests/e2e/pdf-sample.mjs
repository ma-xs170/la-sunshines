// Génère un billet PDF d'exemple (achat de test sur le banc local) : PDF_OUT=/chemin/dossier node tests/e2e/pdf-sample.mjs
import fs from 'fs';
import * as L from './lib.mjs';
const { as, q, one, webhook, sessionCompleted, USERS } = L;
const OUT = process.env.PDF_OUT || '.';
await L.resetDb();
const admin = await as(USERS.admin), cust = await as(USERS.cust);
const tiers = await L.setupEvent(admin);
const SLUG = process.env.SLUG || 'la-nuit-des-ombres';
const tiers2 = SLUG === 'la-nuit-des-ombres' ? tiers : await L.setupEvent(admin, { slug: SLUG, tiers: [{ key: 'std', name: process.env.TIER || 'Standard', price_cents: 1500, quantity_total: 10, max_per_order: 4 }] });
const body = L.checkoutBody(SLUG, [[tiers2.std, 2]]);
body.items[0].participants = process.env.LONG ? [{ first_name: 'Maximilien-Alexandre', last_name: 'Fitzgerald-Van der Steenwegen' }, { first_name: 'Zoé', last_name: 'Ô Brien' }] : [{ first_name: 'Élodie', last_name: 'Dupont-Martin' }, { first_name: 'Zoé', last_name: 'Ô Brien' }];
const r = await cust.req('/api/checkout', { method: 'POST', body });
const order = await one('select * from public.orders where order_number = $1', [r.data.order_number]);
await webhook('checkout.session.completed', sessionCompleted(order));
const t = await q('select id, reference from public.tickets where order_id = $1 order by created_at', [order.id]);
for (const [name, path] of [['billet', `/api/tickets/${t[0].id}/pdf`], ['commande', `/api/orders/${order.id}/pdf`]]) {
  const res = await cust.req(path, { raw: 'buffer' });
  const buf = Buffer.from(await res.res.arrayBuffer());
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/${name}.pdf`, buf);
  console.log(name, res.status, res.headers.get('content-type'), buf.length, 'octets', name === 'billet' ? t[0].reference : '');
}
process.exit(0);
