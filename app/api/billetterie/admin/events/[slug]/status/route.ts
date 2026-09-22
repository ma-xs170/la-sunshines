import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, parseBody } from '@/lib/auth/http';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireBilletterieAdmin } from '@/lib/ticketing/guard';
import { revalidatePublicSite } from '@/lib/revalidate';
import { SLUG_RE } from '@/lib/ticketing/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ status: z.enum(['draft', 'published', 'closed']), reason: z.string().trim().min(3, 'Le motif doit faire au moins 3 caractères.').max(300) });

const ERRORS: Record<string, { status: number; message: string }> = {
  EVENT_NOT_FOUND: { status: 404, message: 'Évènement introuvable.' },
  BAD_STATUS: { status: 400, message: 'Statut invalide.' },
  BAD_TRANSITION: { status: 409, message: 'Cet évènement est annulé : son statut ne peut plus changer ici.' },
  USE_PUBLICATION_QUEUE: { status: 409, message: 'Première publication : passe par la file « Publications à valider » (la checklist doit être vérifiée avant de publier).' },
  REASON_REQUIRED: { status: 400, message: 'Le motif est obligatoire.' },
};

// POST { status, reason } — pour N'IMPORTE QUEL évènement, de n'importe quelle organisation : fermer les ventes (arrêt
// d'urgence), les rouvrir, ou dépublier (retour en brouillon). Motif obligatoire, journalisé (admin.event_status).
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await requireBilletterieAdmin();
  if (!guard.ok) return guard.res;
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return fail('Évènement invalide.');
  const parsed = await parseBody(req, schema);
  if ('res' in parsed) return parsed.res;
  const { data, error } = await createSupabaseAdminClient().rpc('admin_set_event_status', { p_actor: guard.actor, p_slug: slug, p_status: parsed.data.status, p_reason: parsed.data.reason });
  if (error) {
    const known = ERRORS[error.message];
    if (known) return fail(known.message, known.status);
    console.error('[admin-event-status]', error);
    return fail('Changement de statut impossible.', 500);
  }
  revalidatePublicSite();
  return NextResponse.json({ ok: true, ...data });
}
