import { fail } from '@/lib/auth/http';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { csvResponse, toCsv } from '@/lib/ticketing/csv';
import { fetchAll } from '@/lib/ticketing/admin-data';
import { editionForSlug, requireBilletterieAdmin } from '@/lib/ticketing/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const eur = (c: number) => (c / 100).toFixed(2).replace('.', ',');

// GET ?event=<slug> — commandes (CSV). Admin Supabase uniquement ; export journalisé.
export async function GET(req: Request) {
  const guard = await requireBilletterieAdmin();
  if (!guard.ok) return guard.res;
  const slug = new URL(req.url).searchParams.get('event') ?? '';
  if (!editionForSlug(slug)) return fail('Événement introuvable.', 404);
  const db = createSupabaseAdminClient();

  type Row = { order_number: string; created_at: string; status: string; source: string; buyer_email: string; buyer_first_name: string; buyer_last_name: string; subtotal_cents: number; fee_cents: number; total_cents: number; refunded_cents: number; email_status: string; order_items: { tier_name: string; quantity: number }[] };
  const rows = await fetchAll<Row>((from, to) =>
    db.from('orders').select('order_number, created_at, status, source, buyer_email, buyer_first_name, buyer_last_name, subtotal_cents, fee_cents, total_cents, refunded_cents, email_status, order_items(tier_name, quantity)')
      .eq('event_slug', slug).order('created_at').range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>);

  await db.rpc('_audit', { p_actor: guard.actor, p_action: 'export.orders', p_entity: 'ticketed_event', p_entity_id: slug, p_before: null, p_after: { rows: rows.length }, p_meta: {} });
  const csv = toCsv(
    ['Commande', 'Date', 'Statut', 'Origine', 'Email', 'Prénom', 'Nom', 'Billets', 'Sous-total (€)', 'Frais (€)', 'Total (€)', 'Remboursé (€)', 'Type', 'Email de billets'],
    rows.map((o) => [o.order_number, o.created_at, o.status, o.source === 'manual' ? 'Invitation' : 'Achat', o.buyer_email, o.buyer_first_name, o.buyer_last_name, o.order_items.map((i) => `${i.quantity} × ${i.tier_name}`).join(' + '), eur(o.subtotal_cents), eur(o.fee_cents), eur(o.total_cents), eur(o.refunded_cents), o.total_cents === 0 ? 'Gratuit' : 'Payant', o.email_status]),
  );
  return csvResponse(`commandes-${slug}.csv`, csv);
}
