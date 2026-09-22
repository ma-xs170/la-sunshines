// Emails de l'espace organisateur : message d'information aux participants, renvoi d'un billet PDF. SERVEUR UNIQUEMENT.
// Même gabarit et mêmes couleurs que les autres emails du site (lib/mail.ts). Tout texte saisi est ÉCHAPPÉ.

import 'server-only';
import { Resend } from 'resend';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { fromAddress, mailLayout, mailButton, mailScript, siteUrl } from '@/lib/mail';
import { esc } from '@/lib/ticketing/order-mail';
import { loadTicketPages } from '@/lib/ticketing/pdf/data';
import { renderTicketsPdf } from '@/lib/ticketing/pdf/render';
import { formatGp } from '@/lib/ticketing/time';
export { containsLink } from './message-rules';
export { fromAddress };
export const resendConfigured = () => Boolean(process.env.RESEND_API_KEY);

export interface OrgMessageInput {
  subject: string;
  body: string;
  eventTitle: string;
  startsAt: string;
  venue: string;
  organizerName: string;
  replyTo: string;
}

export function buildOrganizerMessage(m: OrgMessageInput) {
  const site = siteUrl();
  const html = mailLayout(`
${mailScript('Une info pour ta soirée')}
<h1 style="font-size:22px;margin:0 0 6px">${esc(m.subject)}</h1>
<p style="margin:0 0 18px;font-size:13px;color:rgba(25,20,16,0.64)"><strong>${esc(m.eventTitle)}</strong> · ${esc(formatGp(m.startsAt))}${m.venue ? ' · ' + esc(m.venue) : ''}</p>
<div style="white-space:pre-line;font-size:15px;margin:0 0 20px">${esc(m.body)}</div>
<p style="margin:0 0 18px">${mailButton(`${site}/compte/billets`, 'Voir mes billets')}</p>
<p style="margin:0;font-size:12px;color:rgba(25,20,16,0.55);border-top:1px solid rgba(25,20,16,0.10);padding-top:14px">
Message d'information envoyé par <strong>${esc(m.organizerName)}</strong>, organisateur de <strong>${esc(m.eventTitle)}</strong>, aux personnes ayant un billet pour cet événement.
Il ne contient ni promotion ni publicité. Pour répondre, écris à <a href="mailto:${esc(m.replyTo)}">${esc(m.replyTo)}</a>.</p>`);
  const text = `${m.subject}\n${m.eventTitle} · ${formatGp(m.startsAt)}\n\n${m.body}\n\n—\nMessage d'information envoyé par ${m.organizerName}, organisateur de ${m.eventTitle}, aux personnes ayant un billet. Aucune promotion. Réponse : ${m.replyTo}`;
  return { subject: `[${m.eventTitle}] ${m.subject}`, html, text };
}

/** Envoie le message à chaque destinataire (par lots), met à jour les statuts APRÈS la réponse de Resend. */
export async function sendOrganizerMessage(messageId: string, recipients: string[], mail: ReturnType<typeof buildOrganizerMessage>, replyTo: string) {
  const key = process.env.RESEND_API_KEY;
  const db = createSupabaseAdminClient();
  const resend = key ? new Resend(key) : null;
  let sent = 0, failed = 0;
  const one = async (email: string) => {
    let err: string | null = null;
    try {
      if (!resend) throw new Error('RESEND_API_KEY manquante.');
      const { error } = await resend.emails.send({ from: fromAddress(), to: [email], replyTo, subject: mail.subject, html: mail.html, text: mail.text });
      if (error) err = `${error.name ?? 'resend'} : ${error.message}`;
    } catch (e) { err = e instanceof Error ? e.message : String(e); }
    await db.rpc('org_message_result', { p_message: messageId, p_email: email, p_ok: err === null, p_error: err });
    if (err) failed++; else sent++;
  };
  for (let i = 0; i < recipients.length; i += 5) await Promise.all(recipients.slice(i, i + 5).map(one));
  return { sent, failed };
}

/** Renvoie le billet (PDF en pièce jointe) à l'acheteur. Renvoie null si OK, sinon le message d'erreur. */
export async function sendTicketPdfEmail(ticketId: string, to: string): Promise<string | null> {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) return 'RESEND_API_KEY manquante.';
    const pages = (await loadTicketPages(createSupabaseAdminClient(), { ticketId })).filter((p) => p.status === 'valid' || p.status === 'used');
    if (pages.length === 0) return 'Billet annulé ou remboursé.';
    const p = pages[0];
    const pdf = await renderTicketsPdf(pages, `Billet ${p.reference}`);
    const site = siteUrl();
    const html = mailLayout(`
${mailScript('Ton billet')}
<h1 style="font-size:22px;margin:0 0 10px">Ton billet en PDF</h1>
<p style="margin:0 0 4px">Voici de nouveau ton billet <strong>${esc(p.reference)}</strong> pour <strong>${esc(p.eventTitle)}</strong> (${esc(formatGp(p.startsAt))}${p.venueName ? ' · ' + esc(p.venueName) : ''}), au nom de ${esc(p.holder)}.</p>
<p style="margin:0 0 18px;font-size:13px;color:rgba(25,20,16,0.64)">Il est en pièce jointe. Présente le QR code à l'entrée, sur ton téléphone ou imprimé. Un billet = une entrée.</p>
<p style="margin:0">${mailButton(`${site}/compte/billets`, 'Voir mes billets')}</p>`);
    const { error } = await new Resend(key).emails.send({
      from: fromAddress(), to: [to], subject: `Ton billet — ${p.eventTitle} (${p.reference})`, html,
      text: `Ton billet ${p.reference} pour ${p.eventTitle} est en pièce jointe. Tous tes billets : ${site}/compte/billets`,
      attachments: [{ filename: `billet-${p.reference}.pdf`, content: pdf }],
    });
    return error ? `${error.name ?? 'resend'} : ${error.message}` : null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
