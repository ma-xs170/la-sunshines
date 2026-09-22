import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminRpc } from '@/lib/adminSpace';
import { NO_STORE, json, requireClientsApi } from '@/lib/admin/clients/access';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Export JSON des données du compte (super-admin, comme la fonction SQL l'exige). Journalisé par la base.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireClientsApi('super'); if (!g.ok) return g.res;
  const { id } = await params; if (!z.uuid().safeParse(id).success) return json({ error: 'Compte introuvable.' }, 404);
  if (!(await rateLimit(`client-export:${g.a.userId}:${clientIp(req)}`, 20, 3600)).ok) return json({ error: 'Trop d’exports. Réessaie plus tard.' }, 429);
  const r = await adminRpc<Record<string, unknown>>('admin_customer_export', { p_actor: g.a.userId, p_id: id });
  if (!r.ok) return json({ error: r.message }, r.status);
  const profile = (r.data.profile ?? {}) as { reference?: string };
  return new NextResponse(JSON.stringify(r.data, null, 2), { headers: { ...NO_STORE, 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${profile.reference ?? id}.json"` } });
}
