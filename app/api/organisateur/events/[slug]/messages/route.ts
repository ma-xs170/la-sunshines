import { z } from 'zod';
import { requireOrganizerApi } from '@/lib/organizer/access';
import { editorial, orgRpc, type OrgEventRow } from '@/lib/organizer/data';
import { buildOrganizerMessage, resendConfigured, sendOrganizerMessage } from '@/lib/organizer/mail';
import { containsLink } from '@/lib/organizer/message-rules';
import { SLUG_RE } from '@/lib/ticketing/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({
  action: z.enum(['preview', 'send']),
  subject: z.string().trim().min(1, 'L’objet est obligatoire.').max(120, 'Objet trop long (120 caractères).'),
  body: z.string().trim().min(1, 'Le message est obligatoire.').max(2000, 'Message trop long (2000 caractères).'),
  scope: z.enum(['all', 'tier', 'selection']),
  tierId: z.uuid().optional(),
  ticketIds: z.array(z.uuid()).max(500).optional(),
  noPromo: z.literal(true, { error: 'Confirme que le message ne contient aucune promotion.' }),
  confirm: z.boolean().optional(),
});

// POST /api/organisateur/events/[slug]/messages — message d'INFORMATION aux participants (jamais de promotion).
//  preview : aperçu (nombre, exemples masqués, rendu de l'email) ; send : envoi, exige confirm=true.
//  owner / manager / admin ; 3 messages max par événement et par 24 h ; 500 destinataires max ; aucun lien autorisé ;
//  adresse de réponse = celle de l'organisateur ; statut d'envoi par destinataire ; envoi journalisé dans audit_log.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  const { slug } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!SLUG_RE.test(slug)) return Response.json({ error: 'Événement introuvable.' }, { status: 404 });
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Requête invalide.' }, { status: 400 });
  const b = parsed.data;
  if (containsLink(b.subject, b.body)) return Response.json({ error: 'Un message d’information ne contient pas de lien : retire les adresses web.' }, { status: 400 });
  if (b.scope === 'tier' && !b.tierId) return Response.json({ error: 'Choisis un tarif.' }, { status: 400 });
  if (b.scope === 'selection' && !(b.ticketIds?.length)) return Response.json({ error: 'Sélectionne au moins un participant.' }, { status: 400 });

  const args = { p_actor: g.s.userId, p_slug: slug, p_scope: b.scope, p_tier: b.scope === 'tier' ? b.tierId : null, p_tickets: b.scope === 'selection' ? b.ticketIds : null };
  const prev = await orgRpc<{ count: number; sample: string[]; reply_to: string; organizer_name: string; sent_last_24h: number }>('org_message_preview', args);
  if (!prev.ok) return Response.json({ error: prev.error.message }, { status: prev.error.status });
  if (!prev.data.reply_to) return Response.json({ error: 'L’organisateur n’a pas d’adresse de réponse : [À COMPLÉTER] dans les informations de l’organisateur.' }, { status: 409 });

  const events = await orgRpc<OrgEventRow[]>('org_events', { p_actor: g.s.userId });
  const ev = events.ok ? events.data.find((e) => e.slug === slug) : undefined;
  const mail = buildOrganizerMessage({
    subject: b.subject, body: b.body, eventTitle: editorial(slug).title, startsAt: ev?.starts_at ?? '', venue: ev?.venue_name ?? '',
    organizerName: prev.data.organizer_name, replyTo: prev.data.reply_to,
  });

  if (b.action === 'preview') {
    return Response.json({ ok: true, count: prev.data.count, sample: prev.data.sample, replyTo: prev.data.reply_to, organizerName: prev.data.organizer_name,
      remainingToday: Math.max(0, 3 - prev.data.sent_last_24h), subject: mail.subject, html: mail.html });
  }
  if (b.confirm !== true) return Response.json({ error: 'Confirmation requise avant l’envoi.' }, { status: 400 });
  if (!resendConfigured()) return Response.json({ error: 'L’envoi d’emails n’est pas configuré (RESEND_API_KEY).' }, { status: 503 });

  const created = await orgRpc<{ message_id: string; reply_to: string; recipients: string[] }>('org_message_create', { ...args, p_subject: b.subject, p_body: b.body });
  if (!created.ok) return Response.json({ error: created.error.message }, { status: created.error.status });
  const res = await sendOrganizerMessage(created.data.message_id, created.data.recipients, mail, created.data.reply_to);
  return Response.json({ ok: true, messageId: created.data.message_id, total: created.data.recipients.length, sent: res.sent, failed: res.failed });
}
