import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, parseBody } from '@/lib/auth/http';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireBilletterieAdmin } from '@/lib/ticketing/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  first_name: z.string().trim().min(1, 'Le prénom est obligatoire.').max(60),
  last_name: z.string().trim().min(1, 'Le nom est obligatoire.').max(60),
  reason: z.string().trim().min(3, 'Le motif doit faire au moins 3 caractères.').max(300),
});

const ERRORS: Record<string, { status: number; message: string }> = {
  TICKET_NOT_FOUND: { status: 404, message: 'Billet introuvable.' },
  TICKET_INACTIVE: { status: 409, message: 'Ce billet est annulé ou remboursé : rien à modifier.' },
  BAD_NAME: { status: 400, message: 'Nom invalide.' },
  REASON_REQUIRED: { status: 400, message: 'Le motif est obligatoire.' },
};

// POST { first_name, last_name, reason } — corrige le nom d'un participant (faute de frappe signalée, cession informelle
// avant l'évènement…). Un billet déjà scanné reste modifiable ; seuls les billets annulés/remboursés sont bloqués.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireBilletterieAdmin();
  if (!guard.ok) return guard.res;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return fail('Billet invalide.');
  const parsed = await parseBody(req, schema);
  if ('res' in parsed) return parsed.res;
  const { data, error } = await createSupabaseAdminClient().rpc('admin_rename_participant', {
    p_actor: guard.actor, p_ticket: id, p_first: parsed.data.first_name, p_last: parsed.data.last_name, p_reason: parsed.data.reason,
  });
  if (error) {
    const known = ERRORS[error.message];
    if (known) return fail(known.message, known.status);
    console.error('[rename-participant]', error);
    return fail('Modification impossible.', 500);
  }
  return NextResponse.json({ ok: true, ...data });
}
