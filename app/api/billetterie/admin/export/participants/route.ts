import { fail } from '@/lib/auth/http';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { csvResponse, toCsv } from '@/lib/ticketing/csv';
import { fetchAll } from '@/lib/ticketing/admin-data';
import { formatGp } from '@/lib/ticketing/time';
import { editionForSlug, requireBilletterieAdmin } from '@/lib/ticketing/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS: Record<string, string> = { valid: 'Valide', used: 'Entré', cancelled: 'Annulé', refunded: 'Remboursé' };

// GET ?event=<slug> — liste des participants (CSV). Ne contient JAMAIS les codes des billets.
// Admin Supabase uniquement ; l'export est journalisé (audit_log).
export async function GET(req: Request) {
  const guard = await requireBilletterieAdmin();
  if (!guard.ok) return guard.res;
  const slug = new URL(req.url).searchParams.get('event') ?? '';
  if (!editionForSlug(slug)) return fail('Événement introuvable.', 404);
  const db = createSupabaseAdminClient();
  const { data: ev } = await db.from('ticketed_events').select('id').eq('event_slug', slug).maybeSingle();
  if (!ev) return fail('Aucune billetterie pour cet événement.', 404);

  type Row = { id: string; status: string; holder_first_name: string; holder_last_name: string; used_at: string | null; ticket_tiers: { name: string } | null; orders: { order_number: string; buyer_email: string; buyer_first_name: string; buyer_last_name: string; buyer_phone: string; source: string } | null };
  const rows = await fetchAll<Row>((from, to) =>
    db.from('tickets').select('id, status, holder_first_name, holder_last_name, used_at, ticket_tiers(name), orders(order_number, buyer_email, buyer_first_name, buyer_last_name, buyer_phone, source)')
      .eq('ticketed_event_id', ev.id).order('created_at').range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>);

  await db.rpc('_audit', { p_actor: guard.actor, p_action: 'export.participants', p_entity: 'ticketed_event', p_entity_id: slug, p_before: null, p_after: { rows: rows.length }, p_meta: {} });
  const csv = toCsv(
    ['Billet', 'Statut', 'Prénom', 'Nom', 'Tarif', 'Commande', 'Origine', 'Email acheteur', 'Prénom acheteur', 'Nom acheteur', 'Téléphone acheteur', 'Entré le'],
    rows.map((t) => [t.id.slice(0, 8), STATUS[t.status] ?? t.status, t.holder_first_name, t.holder_last_name, t.ticket_tiers?.name, t.orders?.order_number, t.orders?.source === 'manual' ? 'Invitation' : 'Achat', t.orders?.buyer_email, t.orders?.buyer_first_name, t.orders?.buyer_last_name, t.orders?.buyer_phone, t.used_at ? formatGp(t.used_at) : '']),
  );
  return csvResponse(`participants-${slug}.csv`, csv);
}
