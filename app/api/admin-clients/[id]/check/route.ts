import { z } from 'zod';
import { adminRpc } from '@/lib/adminSpace';
import { json, requireClientsApi } from '@/lib/admin/clients/access';
import { validateEditForm, type ClientDetail, type EditForm } from '@/lib/admin/clients/detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idSchema = z.uuid();
const editSchema = z.object({ first_name: z.string(), last_name: z.string(), phone: z.string(), phone2: z.string(), email: z.string(), birth_date: z.string(), reason: z.string(), expected_updated_at: z.string() });

// Aperçu AVANT / APRÈS sans rien écrire (fenêtre de confirmation). Ne journalise rien.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireClientsApi('modifier'); if (!g.ok) return g.res;
  const { id } = await params; if (!idSchema.safeParse(id).success) return json({ error: 'Compte introuvable.' }, 404);
  const body = editSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: 'Requête invalide.' }, 400);
  const f: EditForm = body.data;
  const cur = await adminRpc<ClientDetail>('admin_customer_detail', { p_actor: g.a.userId, p_id: id, p_log: false });
  if (!cur.ok) return json({ error: cur.message }, cur.status);
  const v = validateEditForm(f, { email: cur.data.profile.email, birth_date: cur.data.profile.birth_date });
  if (!v.ok) return json({ error: Object.values(v.errors)[0] ?? 'Requête invalide.' }, 400);
  const r = await adminRpc<{ before: Record<string, unknown>; after: Record<string, unknown>; email_changed: boolean }>('admin_customer_check_update', {
    p_actor: g.a.userId, p_id: id, p_first: v.value.first_name, p_last: v.value.last_name, p_phone: v.value.phone, p_phone2: v.value.phone2, p_email: v.value.email, p_birth: v.value.birth_date,
    p_reason: v.value.reason, p_expected: body.data.expected_updated_at,
  });
  if (!r.ok) return json({ error: r.message }, r.status);
  return json({ ...r.data, ageWarning: v.ageWarning });
}
