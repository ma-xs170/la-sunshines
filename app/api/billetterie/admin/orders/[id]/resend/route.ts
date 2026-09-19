import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail } from '@/lib/auth/http';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendOrderEmail } from '@/lib/ticketing/order-mail';
import { requireBilletterieAdmin } from '@/lib/ticketing/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — renvoie l'email de billets (ignore le statut « sent » et l'anti-doublon). Audité.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireBilletterieAdmin();
  if (!guard.ok) return guard.res;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return fail('Commande invalide.');
  const db = createSupabaseAdminClient();
  const outcome = await sendOrderEmail(db, id, { force: true });
  await db.rpc('_audit', { p_actor: guard.actor, p_action: 'order.resend_email', p_entity: 'order', p_entity_id: id, p_before: null, p_after: { outcome: outcome.status }, p_meta: {} });
  if (outcome.status === 'skipped') return fail('Envoi impossible : la commande n’est pas payée.', 409);
  if (outcome.status === 'failed') return fail(`Échec de l’envoi : ${outcome.error}`, 502);
  return NextResponse.json({ ok: true });
}
