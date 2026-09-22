import { z } from 'zod';
import { adminRpc } from '@/lib/adminSpace';
import { json, requireClientsApi } from '@/lib/admin/clients/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const body = z.object({ confirm_email: z.string().trim().min(1) });

// Anonymisation (super-admin uniquement, double confirmation : la personne retape l'adresse e-mail exacte du compte).
// Les commandes restent pour la comptabilité ; refusé s'il reste un billet valide pour un évènement à venir.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireClientsApi('super'); if (!g.ok) return g.res;
  const { id } = await params; if (!z.uuid().safeParse(id).success) return json({ error: 'Compte introuvable.' }, 404);
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: 'Requête invalide.' }, 400);
  const r = await adminRpc<{ orders_kept: number }>('admin_customer_anonymize', { p_actor: g.a.userId, p_id: id, p_confirm_email: p.data.confirm_email });
  return r.ok ? json({ ok: true, orders_kept: r.data.orders_kept }) : json({ error: r.message }, r.status);
}
