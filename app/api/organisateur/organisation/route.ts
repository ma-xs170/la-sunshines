import { z } from 'zod';
import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc } from '@/lib/organizer/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(120),
  legal_form: z.string().trim().max(120),
  siret: z.string().trim().max(20),
  responsible_name: z.string().trim().max(120),
  address: z.string().trim().max(250),
  contact_email: z.string().trim().max(254),
});

// PUT /api/organisateur/organisation — informations légales et adresse d'envoi (propriétaire ou admin ; revérifié en SQL). Journalisé.
export async function PUT(req: Request) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return Response.json({ error: 'Vérifie les champs : le nom de la structure est obligatoire.' }, { status: 400 });
  const v = b.data;
  const r = await orgRpc('org_update_organizer', { p_actor: g.s.userId, p_org: v.id, p_name: v.name, p_legal_form: v.legal_form, p_siret: v.siret, p_responsible: v.responsible_name, p_address: v.address, p_contact_email: v.contact_email });
  if (!r.ok) return Response.json({ error: r.error.message }, { status: r.error.status });
  return Response.json({ ok: true });
}
