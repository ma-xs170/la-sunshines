import { z } from 'zod';
import { adminRpc } from '@/lib/adminSpace';
import { json, requireClientsApi } from '@/lib/admin/clients/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Déconnecte toutes les sessions actives du compte, sans le suspendre.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireClientsApi('modifier'); if (!g.ok) return g.res;
  const { id } = await params; if (!z.uuid().safeParse(id).success) return json({ error: 'Compte introuvable.' }, 404);
  const r = await adminRpc('admin_customer_revoke_sessions', { p_actor: g.a.userId, p_id: id });
  return r.ok ? json({ ok: true }) : json({ error: r.message }, r.status);
}
