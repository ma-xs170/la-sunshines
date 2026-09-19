// Lectures d'administration des commandes (service role, APRÈS contrôle du rôle admin).
import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const PAGE_SIZE = 25;

export async function listOrders(f: { event?: string; status?: string; q?: string; page: number }) {
  const db = createSupabaseAdminClient();
  let query = db
    .from('orders')
    .select('id, order_number, status, source, buyer_email, buyer_first_name, buyer_last_name, total_cents, refunded_cents, created_at, paid_at, event_slug, email_status, order_items(tier_name, quantity)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1);
  if (f.event) query = query.eq('event_slug', f.event);
  if (f.status) query = query.eq('status', f.status);
  if (f.q) {
    const q = f.q.replace(/[%_,()*\\]/g, ' ').trim();   // défense en profondeur (la regex zod filtre déjà)
    if (q) query = query.or(`buyer_email.ilike.%${q}%,buyer_last_name.ilike.%${q}%,buyer_first_name.ilike.%${q}%,order_number.ilike.%${q}%`);
  }
  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { orders: data ?? [], total: count ?? 0, pageSize: PAGE_SIZE };
}

export async function getOrderDetail(id: string) {
  const db = createSupabaseAdminClient();
  const { data: order } = await db
    .from('orders')
    .select('*, order_items(id, tier_name, quantity, unit_price_cents, event_title, event_starts_at, venue_name)')
    .eq('id', id)
    .maybeSingle();
  if (!order) return null;
  const [{ data: tickets }, { data: refunds }] = await Promise.all([
    db.from('tickets').select('id, status, holder_first_name, holder_last_name, used_at, order_item_id').eq('order_id', id).order('created_at'),
    db.from('refunds').select('id, amount_cents, status, reason, source, created_at, stripe_refund_id').eq('order_id', id).order('created_at'),
  ]);
  return { order, tickets: tickets ?? [], refunds: refunds ?? [] };
}

/** Toutes les lignes (pagination interne par blocs de 1000) — pour les exports. */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
