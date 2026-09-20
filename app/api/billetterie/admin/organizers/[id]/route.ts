import { z } from 'zod';
import { requireBilletterieAdmin } from '@/lib/ticketing/guard';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire.').max(120),
  legal_form: z.string().trim().max(120).default(''),
  siret: z.string().transform((v) => v.replace(/\s/g, '')).pipe(z.string().regex(/^(\d{14})?$/, 'SIRET : 14 chiffres (ou vide).')),
  responsible_name: z.string().trim().max(120).default(''),
  address: z.string().trim().max(250).default(''),
  contact_email: z.union([z.literal(''), z.email('Adresse email invalide.').max(254)]).default(''),
});

// PATCH /api/billetterie/admin/organizers/[id] — informations de l'organisateur (bloc « organisateur » du billet PDF,
// adresse de réponse des messages). Compte Supabase ADMIN uniquement ; modification journalisée (avant / après).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireBilletterieAdmin();
  if (!g.ok) return g.res;
  const { id } = await params;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !p.success) return Response.json({ error: p.success ? 'Requête invalide.' : p.error.issues[0]?.message }, { status: 400 });

  const db = createSupabaseAdminClient();
  const { data: before } = await db.from('organizers').select('name, legal_form, siret, responsible_name, address, contact_email').eq('id', id).maybeSingle();
  if (!before) return Response.json({ error: 'Organisateur introuvable.' }, { status: 404 });
  const { error } = await db.from('organizers').update(p.data).eq('id', id);
  if (error) return Response.json({ error: 'Enregistrement impossible.' }, { status: 500 });
  await db.from('audit_log').insert({ actor_id: g.actor, action: 'organizer.update', entity: 'organizer', entity_id: id, before, after: p.data });
  return Response.json({ ok: true });
}
