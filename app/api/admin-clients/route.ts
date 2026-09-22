import { adminRpc } from '@/lib/adminSpace';
import { json, requireClientsApi } from '@/lib/admin/clients/access';
import { parseClientsQuery, rpcArgs, type ClientsPage } from '@/lib/admin/clients/query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/admin-clients?q=&role=&statut=&avenir=1&mineurs=1&tri=&sens=&page= : même liste que la page (20 par page). 404 pour tout compte non autorisé.
export async function GET(req: Request) {
  const g = await requireClientsApi(); if (!g.ok) return g.res;
  const query = parseClientsQuery(new URL(req.url).searchParams);
  const r = await adminRpc<ClientsPage>('admin_list_customers', { p_actor: g.a.userId, ...rpcArgs(query) });
  return r.ok ? json(r.data) : json({ error: r.message }, r.status);
}
