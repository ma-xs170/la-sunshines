import { z } from 'zod';
import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc } from '@/lib/organizer/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ org: z.string().uuid(), kind: z.enum(['daily_sales', 'support_message', 'low_stock', 'refund', 'send_error']), email: z.boolean() });

// PUT — préférence PERSONNELLE de l'utilisateur connecté (l'acteur vient de la session, jamais du corps de la requête).
export async function PUT(req: Request) {
  const g = await requireOrganizerApi(); if (!g.ok) return g.res;
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  const r = await orgRpc('org_notif_set', { p_actor: g.s.userId, p_org: p.data.org, p_kind: p.data.kind, p_email: p.data.email });
  return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error.message }, { status: r.error.status });
}
