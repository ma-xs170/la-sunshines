import { randomUUID } from 'crypto';
import { requireOrganizerApi } from '@/lib/organizer/access';
import { editorial } from '@/lib/organizer/data';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { invitationSchema, SLUG_RE } from '@/lib/ticketing/schemas';
import { newTicketCode } from '@/lib/ticketing/tokens';
import { sendOrderEmail } from '@/lib/ticketing/order-mail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ERR: Record<string, string> = {
  SOLD_OUT_TIER: 'Plus assez de places pour ce tarif.', SOLD_OUT_EVENT: 'Capacité de l’évènement atteinte.', TIER_UNAVAILABLE: 'Tarif indisponible.',
  INVALID_ITEMS: 'Invitation invalide.', FORBIDDEN: 'Accès refusé.', EVENT_NOT_FOUND: 'Évènement introuvable.',
};

// POST { tier_id, guests:[{email, first_name, last_name, quantity}] } — billets gratuits (commande « manuelle » à 0 €) + e-mail de billets.
// Rôle owner / manager / admin et appartenance à l'organisation revérifiés en SQL (org_create_invitation).
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  const parsed = invitationSchema.safeParse({ ...(body ?? {}), slug });
  if (!SLUG_RE.test(slug) || !parsed.success) return Response.json({ error: parsed.success ? 'Requête invalide.' : parsed.error.issues[0]?.message ?? 'Requête invalide.' }, { status: 400 });
  const { tier_id, guests } = parsed.data;
  const db = createSupabaseAdminClient();
  const results: { email: string; ok: boolean; email_status?: string; error?: string }[] = [];
  for (const gu of guests) {
    const holders = Array.from({ length: gu.quantity }, () => ({ id: randomUUID(), code: newTicketCode(), first_name: gu.first_name, last_name: gu.last_name }));
    const { data, error } = await db.rpc('org_create_invitation', { p_actor: g.s.userId, p_slug: slug, p_tier: tier_id, p_event_title: editorial(slug).title, p_email: gu.email, p_first: gu.first_name, p_last: gu.last_name, p_holders: holders });
    if (error) {
      results.push({ email: gu.email, ok: false, error: ERR[error.message] ?? 'Création impossible.' });
      if (!ERR[error.message]) console.error('[invitation organisateur]', error.message);
      if (error.message === 'FORBIDDEN') break;
      continue;
    }
    const outcome = await sendOrderEmail(db, data as string, { force: true });
    results.push({ email: gu.email, ok: true, email_status: outcome.status });
  }
  return Response.json({ ok: results.length > 0 && results.every((r) => r.ok), results });
}
