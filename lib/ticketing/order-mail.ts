// Email de commande (Resend). SERVEUR UNIQUEMENT.
//
// Garanties :
//  * ne lève JAMAIS d'exception : un échec d'envoi ne doit pas faire échouer un webhook ;
//  * le statut (pending / sent / failed), le nombre de tentatives et la dernière erreur
//    sont mis à jour APRÈS la réponse de Resend (mark_email_result) ;
//  * claim_email_send (atomique) évite les doubles envois (rejeux du webhook, double clic) ;
//  * le billet reste téléchargeable dans « Mes billets » quoi qu'il arrive ;
//  * tout texte venant d'un utilisateur (noms, titres) est échappé dans le HTML.

import 'server-only';
import { Resend } from 'resend';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mailLayout, mailButton, mailScript, siteUrl } from '@/lib/mail';
import { formatCode } from './tokens';
import { qrPng } from './qr';
import { loadTicketPages } from './pdf/data';
import { renderTicketsPdf } from './pdf/render';
import { formatEuro, formatGp } from './time';

const FALLBACK_FROM = 'LA SUNSHINES <onboarding@resend.dev>';

export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface MailOrder {
  id: string;
  order_number: string;
  status: string;
  buyer_email: string;
  buyer_first_name: string;
  subtotal_cents: number;
  fee_cents: number;
  total_cents: number;
  items: { event_title: string; event_starts_at: string; venue_name: string; venue_address: string; tier_name: string; quantity: number; unit_price_cents: number }[];
  tickets: { id: string; code: string; holder_first_name: string; holder_last_name: string; tier_name: string }[];
}

export type SendOutcome = { status: 'sent' | 'failed' | 'skipped'; error?: string };

async function loadOrder(db: SupabaseClient, orderId: string): Promise<MailOrder | null> {
  const { data: o } = await db
    .from('orders')
    .select('id, order_number, status, buyer_email, buyer_first_name, subtotal_cents, fee_cents, total_cents, order_items(event_title, event_starts_at, venue_name, venue_address, tier_name, quantity, unit_price_cents)')
    .eq('id', orderId)
    .maybeSingle();
  if (!o) return null;
  const { data: t } = await db
    .from('tickets')
    .select('id, code, holder_first_name, holder_last_name, order_items(tier_name)')
    .eq('order_id', orderId)
    .order('created_at');
  const tickets = (t ?? []).map((x) => ({
    id: x.id as string,
    code: x.code as string,
    holder_first_name: x.holder_first_name as string,
    holder_last_name: x.holder_last_name as string,
    tier_name: ((x.order_items as unknown as { tier_name: string } | null)?.tier_name) ?? '',
  }));
  return { ...(o as unknown as Omit<MailOrder, 'items' | 'tickets'>), items: (o as unknown as { order_items: MailOrder['items'] }).order_items ?? [], tickets };
}

const FOOT = 'TVA non applicable, art. 293 B du CGI.';

/** Contenu HTML / texte de l'email de confirmation (pur : testable sans réseau). */
export function buildConfirmationEmail(order: MailOrder, base: string) {
  const first = order.items[0];
  const title = first?.event_title ?? 'ton événement';
  const lines = order.items
    .map((i) => `<tr><td style="padding:4px 0">${esc(i.tier_name)} × ${i.quantity}</td><td style="padding:4px 0;text-align:right">${formatEuro(i.unit_price_cents * i.quantity)}</td></tr>`)
    .join('');
  const fee = order.fee_cents > 0 ? `<tr><td style="padding:4px 0">Frais de service</td><td style="padding:4px 0;text-align:right">${formatEuro(order.fee_cents)}</td></tr>` : '';
  const blocks = order.tickets
    .map(
      (t, i) => `<div style="background:#FFF8EE;border:1px solid rgba(25,20,16,0.10);border-radius:18px;padding:18px 16px;margin:0 0 14px;text-align:center">
<p style="margin:0 0 2px;font-weight:700;font-size:16px">${esc(t.holder_first_name)} ${esc(t.holder_last_name)}</p>
<p style="margin:0 0 12px;color:rgba(25,20,16,0.64);font-size:13px">${esc(t.tier_name)}</p>
<img src="cid:qr-${i}" width="200" height="200" alt="QR code du billet ${i + 1}" style="display:block;margin:0 auto 10px;background:#fff;border-radius:14px;padding:6px" />
<p style="margin:0 0 8px;font-family:monospace;font-size:12px;letter-spacing:.04em">${formatCode(t.code)}</p>
<a href="${base}/compte/billets/${t.id}" style="color:#A5670F;font-size:13px;font-weight:600">Ouvrir ce billet</a></div>`,
    )
    .join('');
  const html = mailLayout(`
${mailScript('Ta soirée t’attend')}
<h1 style="font-size:24px;margin:0 0 12px">Tes billets sont prêts</h1>
<p style="margin:0 0 4px">Salut ${esc(order.buyer_first_name || '')}, merci pour ta commande <strong>${esc(order.order_number)}</strong>.</p>
<p style="margin:0 0 18px"><strong>${esc(title)}</strong><br>${esc(formatGp(first?.event_starts_at))}<br>${esc(first?.venue_name ?? '')}${first?.venue_address ? ' — ' + esc(first.venue_address) : ''}</p>
${blocks}
<p style="margin:0 0 18px;text-align:center">${mailButton(`${base}/compte/billets`, 'Voir mes billets')}</p>
<p style="margin:0 0 4px;font-size:13px;color:rgba(25,20,16,0.64)">Tes billets sont aussi en <strong>PDF</strong> en pièce jointe (un billet = une page), et téléchargeables dans « Mes billets ». Présente le QR code à l'entrée, sur ton téléphone ou imprimé. Chaque billet n'est valable qu'une fois : ne le partage pas.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:14px">${lines}${fee}
<tr><td style="padding:8px 0 0;font-weight:700;border-top:1px solid rgba(25,20,16,0.10)">Total</td><td style="padding:8px 0 0;text-align:right;font-weight:700;border-top:1px solid rgba(25,20,16,0.10)">${formatEuro(order.total_cents)}</td></tr></table>
<p style="margin:14px 0 0;font-size:12px;color:rgba(25,20,16,0.55)">${FOOT} Retrouve tous tes billets dans <a href="${base}/compte/billets">Mes billets</a>.</p>`);
  const text = [
    `Tes billets — ${title}`,
    `Commande ${order.order_number} · ${formatEuro(order.total_cents)}`,
    `${formatGp(first?.event_starts_at)} · ${first?.venue_name ?? ''}`,
    '',
    ...order.tickets.map((t, i) => `Billet ${i + 1} — ${t.holder_first_name} ${t.holder_last_name} (${t.tier_name}) : ${formatCode(t.code)}`),
    '',
    `Tes billets sont aussi en PDF en pièce jointe. Tous tes billets : ${base}/compte/billets`,
    FOOT,
  ].join('\n');
  return { subject: `Tes billets — ${title} (${order.order_number})`, html, text };
}

/** Email « commande non confirmée, remboursée » (places épuisées pendant le paiement). */
export function buildStockLostEmail(order: MailOrder, base: string) {
  const title = order.items[0]?.event_title ?? 'ton événement';
  const html = mailLayout(`
<h1 style="font-size:22px;margin:0 0 12px">Ta commande n'a pas pu être confirmée</h1>
<p>Salut ${esc(order.buyer_first_name || '')}, les places de <strong>${esc(title)}</strong> ont été épuisées pendant ton paiement (commande <strong>${esc(order.order_number)}</strong>).</p>
<p><strong>Tu es remboursé(e) intégralement</strong> (${formatEuro(order.total_cents)}, frais compris) sur ta carte bancaire, sous 5 à 10 jours ouvrés selon ta banque. Aucune action n'est nécessaire.</p>
<p style="font-size:13px;color:#6b6358">Désolé pour ce désagrément. <a href="${base}/editions" style="color:#A5670F">Voir les éditions</a> · <a href="${base}/contact" style="color:#A5670F">Nous contacter</a></p>`);
  return {
    subject: `Commande ${order.order_number} non confirmée — remboursement intégral`,
    html,
    text: `Les places de ${title} ont été épuisées pendant ton paiement. Commande ${order.order_number} : remboursement intégral de ${formatEuro(order.total_cents)} sous 5 à 10 jours ouvrés.`,
  };
}

/**
 * Envoie l'email de la commande (confirmation avec QR, ou « non confirmée » si aucun billet).
 * force = renvoi demandé par un admin (ignore le statut « sent » et le délai anti-doublon).
 */
export async function sendOrderEmail(db: SupabaseClient, orderId: string, opts: { force?: boolean } = {}): Promise<SendOutcome> {
  try {
    const { data: claimed } = await db.rpc('claim_email_send', { p_order: orderId, p_force: opts.force === true });
    if (claimed !== true) return { status: 'skipped' };

    let failure: string | null = null;
    try {
      const order = await loadOrder(db, orderId);
      if (!order) throw new Error('Commande introuvable.');
      const key = process.env.RESEND_API_KEY;
      if (!key) throw new Error('RESEND_API_KEY manquante.');
      const base = siteUrl();
      const withTickets = order.tickets.length > 0;
      const mail = withTickets ? buildConfirmationEmail(order, base) : buildStockLostEmail(order, base);
      const attachments: { filename: string; content: Buffer; contentId?: string }[] = withTickets
        ? await Promise.all(order.tickets.map(async (t, i) => ({ filename: `billet-${order.order_number}-${i + 1}.png`, content: await qrPng(t.code, 480), contentId: `qr-${i}` })))
        : [];
      // PDF des billets (une page par billet) en pièce jointe. Un échec de génération n'empêche JAMAIS l'email :
      // il part sans le PDF (les QR restent dans le corps du message et le PDF dans « Mes billets »).
      if (withTickets) {
        try {
          const pages = (await loadTicketPages(db, { orderId })).filter((p) => p.status === 'valid' || p.status === 'used');
          if (pages.length > 0) attachments.push({ filename: `billets-${order.order_number}.pdf`, content: await renderTicketsPdf(pages, `Billets ${order.order_number}`) });
        } catch (e) {
          console.error('[order-mail] PDF non joint pour', orderId, ':', e instanceof Error ? e.message : e);
        }
      }
      const { error } = await new Resend(key).emails.send({
        from: process.env.MAIL_FROM || FALLBACK_FROM,
        to: [order.buyer_email],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        attachments,
      });
      if (error) failure = `${error.name ?? 'resend'} : ${error.message}`;
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
    }

    // Le statut n'est écrit qu'APRÈS la réponse de Resend.
    await db.rpc('mark_email_result', { p_order: orderId, p_ok: failure === null, p_error: failure });
    if (failure) console.error('[order-mail] envoi en échec pour', orderId, ':', failure);
    return failure === null ? { status: 'sent' } : { status: 'failed', error: failure };
  } catch (e) {
    console.error('[order-mail] erreur inattendue :', e);
    return { status: 'failed', error: e instanceof Error ? e.message : String(e) };
  }
}

export async function afterOrderPaid(db: SupabaseClient, orderId: string): Promise<void> {
  await sendOrderEmail(db, orderId);
}
export async function afterStockLost(db: SupabaseClient, orderId: string): Promise<void> {
  await sendOrderEmail(db, orderId);
}
