import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth/roles';
import { fail, parseBody } from '@/lib/auth/http';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient, supabaseAdminConfigured } from '@/lib/supabase/admin';
import { stripeConfigured } from '@/lib/stripe';
import { expireSessions } from '@/lib/ticketing/checkout';
import { cancelCheckoutSchema } from '@/lib/ticketing/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/checkout/cancel { order_number } — le client abandonne SA réservation en cours
// (retour « paiement annulé ») : les places sont libérées tout de suite. Idempotent.
export async function POST(req: Request) {
  if (!supabaseAdminConfigured()) return fail('Indisponible.', 503);
  const guard = await requireApiRole('customer');
  if (!guard.ok) return guard.res;
  const parsed = await parseBody(req, cancelCheckoutSchema);
  if ('res' in parsed) return parsed.res;

  // le client ne « voit » que ses commandes (RLS) : un numéro d'autrui renvoie 404
  const supabase = await createSupabaseServerClient();
  const { data: order } = await supabase
    .from('orders')
    .select('id')
    .eq('order_number', parsed.data.order_number)
    .maybeSingle();
  if (!order) return fail('Commande introuvable.', 404);

  const db = createSupabaseAdminClient();
  const { data } = await db.rpc('cancel_pending_order', { p_order: order.id, p_user: guard.session.userId });
  const row = (Array.isArray(data) ? data[0] : data) as { cancelled: boolean; session_id: string | null } | undefined;
  if (row?.cancelled && row.session_id && stripeConfigured()) void expireSessions([row.session_id]);
  return NextResponse.json({ ok: true, cancelled: Boolean(row?.cancelled) });
}
