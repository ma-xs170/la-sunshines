import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { fail, parseBody } from '@/lib/auth/http';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { invitationSchema } from '@/lib/ticketing/schemas';
import { newTicketCode } from '@/lib/ticketing/tokens';
import { sendOrderEmail } from '@/lib/ticketing/order-mail';
import { editionForSlug, requireBilletterieAdmin } from '@/lib/ticketing/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ERR: Record<string, string> = {
  SOLD_OUT_TIER: 'Plus assez de places pour ce tarif.',
  SOLD_OUT_EVENT: 'Capacité de l’événement atteinte.',
  TIER_UNAVAILABLE: 'Tarif indisponible.',
  EVENT_NOT_FOUND: 'Configure d’abord la billetterie de cet événement.',
  INVALID_ITEMS: 'Invitation invalide.',
  FORBIDDEN: 'Accès refusé.',
};

// POST { slug, tier_id, guests:[{email, first_name, last_name, quantity}] }
// Crée des billets SANS paiement (commande « manuelle » à 0 €) et envoie l'email de billets.
export async function POST(req: Request) {
  const guard = await requireBilletterieAdmin();
  if (!guard.ok) return guard.res;
  const parsed = await parseBody(req, invitationSchema);
  if ('res' in parsed) return parsed.res;
  const { slug, tier_id, guests } = parsed.data;
  const edition = editionForSlug(slug);
  if (!edition) return fail('Événement introuvable.', 404);

  const db = createSupabaseAdminClient();
  const results: { email: string; ok: boolean; order_id?: string; email_status?: string; error?: string }[] = [];
  for (const g of guests) {
    const holders = Array.from({ length: g.quantity }, () => ({
      id: randomUUID(), code: newTicketCode(), first_name: g.first_name, last_name: g.last_name,
    }));
    const { data, error } = await db.rpc('admin_create_invitation', {
      p_actor: guard.actor, p_slug: slug, p_tier: tier_id, p_event_title: edition.name,
      p_email: g.email, p_first: g.first_name, p_last: g.last_name, p_holders: holders,
    });
    if (error) {
      results.push({ email: g.email, ok: false, error: ERR[error.message] ?? 'Création impossible.' });
      if (!ERR[error.message]) console.error('[invitation]', error);
      continue;
    }
    const outcome = await sendOrderEmail(db, data as string, { force: true });
    results.push({ email: g.email, ok: true, order_id: data as string, email_status: outcome.status });
  }
  return NextResponse.json({ ok: results.every((r) => r.ok), results });
}
