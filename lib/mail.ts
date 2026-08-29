// Envoi d'emails transactionnels (Resend). Best-effort : un échec est logué,
// jamais propagé — l'action métier ne doit pas échouer parce qu'un mail n'est
// pas parti.

import { Resend } from 'resend';

const FROM = 'LA SUNSHINES <onboarding@resend.dev>';

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  /** ex. List-Unsubscribe pour les emails d'abonnement. */
  headers?: Record<string, string>;
  replyTo?: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const resend = new Resend(key);
    await resend.emails.send({
      from: FROM,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      headers: opts.headers,
      replyTo: opts.replyTo,
    });
    return true;
  } catch (e) {
    console.error('[mail] échec envoi :', e);
    return false;
  }
}

/** Gabarit HTML minimal, sobre, cohérent avec la marque. */
export function mailLayout(bodyHtml: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#191410;line-height:1.6">
<p style="font-weight:800;letter-spacing:.02em;margin:0 0 16px">LA SUNSHINES</p>
${bodyHtml}
<hr style="border:none;border-top:1px solid #e8e0d2;margin:24px 0" />
<p style="font-size:12px;color:#8a8378;margin:0">LA SUNSHINES — soirées 12–17 ans en Guadeloupe.</p>
</div>`;
}

export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL || 'https://la-sunshines.vercel.app'
  ).replace(/\/$/, '');
}
