import { NextResponse } from 'next/server';
import { adminRpc } from '@/lib/adminSpace';
import { json, NO_STORE, requireClientsApi } from '@/lib/admin/clients/access';
import { customersCsv, type ExportRow } from '@/lib/admin/clients/csv';
import { parseClientsQuery } from '@/lib/admin/clients/query';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/admin-clients/export?…filtres…&ack=1[&mineurs_inclus=1] : CSV du résultat filtré. Super-admin uniquement (404 sinon).
// « ack=1 » = avertissement RGPD accepté dans l'interface. Les mineurs n'en font partie que si mineurs_inclus=1. Export journalisé par la base (sans le texte cherché).
export async function GET(req: Request) {
  const g = await requireClientsApi('super'); if (!g.ok) return g.res;
  const sp = new URL(req.url).searchParams;
  if (sp.get('ack') !== '1') return json({ error: 'L’avertissement RGPD doit être accepté avant l’export.' }, 400);
  if (!(await rateLimit(`clients-export:${g.a.userId}:${clientIp(req)}`, 10, 3600)).ok) return json({ error: 'Trop d’exports. Réessaie plus tard.' }, 429);
  const c = parseClientsQuery(sp);
  const r = await adminRpc<ExportRow[]>('admin_customers_export', { p_actor: g.a.userId, p_q: c.q || null, p_role: c.role, p_status: c.status || null, p_upcoming: c.upcoming, p_minors: c.minors, p_include_minors: sp.get('mineurs_inclus') === '1' });
  if (!r.ok) return json({ error: r.message }, r.status);
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(customersCsv(r.data), { headers: { ...NO_STORE, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="clients-${day}.csv"` } });
}
