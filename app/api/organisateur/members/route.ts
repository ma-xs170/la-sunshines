import { z } from 'zod';
import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc } from '@/lib/organizer/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const role = z.enum(['owner', 'manager', 'staff']);
const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), org: z.string().uuid(), email: z.string().trim().email().max(254), role }),
  z.object({ action: z.literal('role'), org: z.string().uuid(), user: z.string().uuid(), role }),
  z.object({ action: z.literal('remove'), org: z.string().uuid(), user: z.string().uuid() }),
]);

// POST /api/organisateur/members — ajouter (par e-mail d'un compte existant), changer le rôle, retirer. Propriétaire ou admin (revérifié en SQL) ;
// le dernier propriétaire est protégé ; chaque action est journalisée dans audit_log.
export async function POST(req: Request) {
  const g = await requireOrganizerApi(); if (!g.ok) return g.res;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  const d = p.data;
  const r = d.action === 'add' ? await orgRpc('org_member_add', { p_actor: g.s.userId, p_org: d.org, p_email: d.email, p_role: d.role })
    : d.action === 'role' ? await orgRpc('org_member_set_role', { p_actor: g.s.userId, p_org: d.org, p_user: d.user, p_role: d.role })
    : await orgRpc('org_member_remove', { p_actor: g.s.userId, p_org: d.org, p_user: d.user });
  return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error.message }, { status: r.error.status });
}
