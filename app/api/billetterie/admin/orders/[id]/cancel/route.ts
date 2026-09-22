import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, parseBody } from '@/lib/auth/http';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireBilletterieAdmin } from '@/lib/ticketing/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ reason: z.string().trim().min(3, 'Le motif doit faire au moins 3 caractères.').max(300) });

const ERRORS: Record<string, { status: number; message: string }> = {
  ORDER_NOT_FOUND: { status: 404, message: 'Commande introuvable.' },
  HAS_USED_TICKETS: { status: 409, message: 'Cette commande a des billets déjà scannés : annule-les individuellement si besoin, ou contacte les participants d’abord.' },
  REASON_REQUIRED: { status: 400, message: 'Le motif est obligatoire.' },
};

// POST { reason } — annule une commande COMPLÈTE (ses billets non utilisés). N'engage JAMAIS Stripe : distinct du
// remboursement (déjà existant). Sert aux doublons, erreurs de saisie, commandes manuelles annulées avant l'évènement.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireBilletterieAdmin();
  if (!guard.ok) return guard.res;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return fail('Commande invalide.');
  const parsed = await parseBody(req, schema);
  if ('res' in parsed) return parsed.res;
  const { data, error } = await createSupabaseAdminClient().rpc('admin_cancel_order', { p_actor: guard.actor, p_order: id, p_reason: parsed.data.reason });
  if (error) {
    const known = ERRORS[error.message];
    if (known) return fail(known.message, known.status);
    console.error('[cancel-order]', error);
    return fail('Annulation impossible.', 500);
  }
  return NextResponse.json({ ok: true, ...data });
}
