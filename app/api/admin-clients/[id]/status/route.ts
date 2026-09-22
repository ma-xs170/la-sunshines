import { z } from 'zod';
import { adminRpc } from '@/lib/adminSpace';
import { json, requireClientsApi } from '@/lib/admin/clients/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const body = z.object({ status: z.enum(['active', 'suspended']), reason: z.string().trim().min(5, 'Motif obligatoire (5 caractères minimum).').max(300) });

// Suspendre ou réactiver le compte (motif obligatoire). Le compte suspendu perd tout accès (auth.users.banned_until) et ses sessions sont coupées.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireClientsApi('modifier'); if (!g.ok) return g.res;
  const { id } = await params; if (!z.uuid().safeParse(id).success) return json({ error: 'Compte introuvable.' }, 404);
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: p.error.issues[0]?.message ?? 'Requête invalide.' }, 400);
  const r = await adminRpc('admin_customer_set_status', { p_actor: g.a.userId, p_id: id, p_status: p.data.status, p_reason: p.data.reason });
  return r.ok ? json({ ok: true }) : json({ error: r.message }, r.status);
}
