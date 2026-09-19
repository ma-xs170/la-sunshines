import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail } from '@/lib/auth/http';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireBilletterieAdmin } from '@/lib/ticketing/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — annule UN billet (sans remboursement) : la place est libérée. Impossible s'il est déjà scanné.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireBilletterieAdmin();
  if (!guard.ok) return guard.res;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return fail('Billet invalide.');
  const { data, error } = await createSupabaseAdminClient().rpc('admin_cancel_ticket', { p_actor: guard.actor, p_ticket: id });
  if (error) {
    if (error.message === 'TICKET_USED') return fail('Ce billet a déjà été scanné : il ne peut plus être annulé.', 409);
    if (error.message === 'TICKET_NOT_FOUND') return fail('Billet introuvable.', 404);
    if (error.message === 'FORBIDDEN') return fail('Accès refusé.', 403);
    console.error('[cancel-ticket]', error);
    return fail('Annulation impossible.', 500);
  }
  return NextResponse.json({ ok: true, status: data });
}
