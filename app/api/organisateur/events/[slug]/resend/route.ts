import { z } from 'zod';
import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc } from '@/lib/organizer/data';
import { sendTicketPdfEmail } from '@/lib/organizer/mail';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { SLUG_RE } from '@/lib/ticketing/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// POST /api/organisateur/events/[slug]/resend { ticketId } — renvoie le billet PDF à l'acheteur par email.
// owner / manager / admin uniquement ; billet annulé ou remboursé refusé ; 1 renvoi par billet et par minute ; journalisé.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  const { slug } = await params;
  const body = z.object({ ticketId: z.uuid() }).safeParse(await req.json().catch(() => null));
  if (!SLUG_RE.test(slug) || !body.success) return Response.json({ error: 'Requête invalide.' }, { status: 400 });

  const t = await orgRpc<{ ticket_id: string; status: string; buyer_email: string }>('org_ticket_for_resend', { p_actor: g.s.userId, p_slug: slug, p_ticket: body.data.ticketId });
  if (!t.ok) return Response.json({ error: t.error.message }, { status: t.error.status });
  if (t.data.status !== 'valid' && t.data.status !== 'used') return Response.json({ error: 'Ce billet est annulé ou remboursé : rien à renvoyer.' }, { status: 409 });

  const since = new Date(Date.now() - 60_000).toISOString();
  const { data: recent } = await createSupabaseAdminClient().from('audit_log').select('id').eq('action', 'organizer.ticket_resend').eq('meta->>ticket_id', t.data.ticket_id).gt('created_at', since).limit(1);
  if (recent && recent.length > 0) return Response.json({ error: 'Ce billet vient d’être renvoyé. Réessaie dans une minute.' }, { status: 429 });

  const err = await sendTicketPdfEmail(t.data.ticket_id, t.data.buyer_email);
  await orgRpc('org_log', { p_actor: g.s.userId, p_slug: slug, p_action: 'organizer.ticket_resend', p_meta: { ticket_id: t.data.ticket_id, ok: err === null } });
  if (err) return Response.json({ error: 'L’email n’est pas parti. Réessaie plus tard.' }, { status: 502 });
  return Response.json({ ok: true });
}
