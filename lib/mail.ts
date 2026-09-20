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

/**
 * Gabarit HTML des emails, aux couleurs et à la typographie du site (tokens de app/globals.css) :
 * fond crème #FFF8EE, encre #191410, ambre #FFB238 / #A5670F, corail #FF6B5B, carte « verre » blanche arrondie (26 px),
 * titres en Unbounded 800 capitales, accroches manuscrites en Caveat 700, texte en Inter. Les polices sont chargées depuis
 * Google Fonts quand le client mail le permet (Apple Mail, Outlook Mac…) ; sinon repli sur des polices système proches.
 */
export const MAIL_FONT_LINK =
  'https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Inter:wght@400;600;700&family=Unbounded:wght@800&display=swap';
const DISPLAY = "Unbounded,'Arial Black','Trebuchet MS',Arial,sans-serif";
const SCRIPT = "Caveat,'Segoe Script','Brush Script MT',cursive";
const BODY = "Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Bouton principal (ambre, pilule) — même style que .btn--amber du site. */
export function mailButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#FFB238;color:#191410;font-family:${BODY};font-weight:700;font-size:14px;text-decoration:none;padding:12px 24px;border-radius:999px">${label}</a>`;
}

/** Accroche manuscrite (Caveat, ambre foncé) — comme .script sur le site. */
export function mailScript(text: string): string {
  return `<p style="font-family:${SCRIPT};font-weight:700;font-size:24px;line-height:1;color:#A5670F;margin:0 0 6px">${text}</p>`;
}

export function mailLayout(bodyHtml: string): string {
  const site = siteUrl();
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="${MAIL_FONT_LINK}" rel="stylesheet">
<style>
  h1,h2,h3{font-family:${DISPLAY};font-weight:800;text-transform:uppercase;letter-spacing:-0.03em;line-height:1.08;color:#191410}
  a{color:#A5670F}
  @media (max-width:520px){.card{padding:20px 16px !important;border-radius:20px !important}}
</style></head>
<body style="margin:0;padding:0;background:#FFF8EE">
<div style="background:#FFF8EE;padding:24px 14px">
<div style="max-width:560px;margin:0 auto;font-family:${BODY};color:#191410;line-height:1.6;font-size:15px">
  <div style="text-align:center;padding:4px 0 18px"><a href="${site}" style="text-decoration:none"><img src="${site}/images/logo-dark.png" alt="La Sunshines" height="30" style="height:30px;width:auto;border:0;outline:none;font-family:${DISPLAY};font-weight:800;font-size:20px;color:#191410"></a></div>
  <div class="card" style="background:#FFFFFF;border:1px solid rgba(25,20,16,0.10);border-radius:26px;padding:28px 26px;box-shadow:0 14px 34px rgba(25,20,16,0.08)">
    <div style="height:5px;border-radius:999px;background:#FFB238;background:linear-gradient(90deg,#FFB238,#FF6B5B);margin:-6px 0 22px"></div>
${bodyHtml}
  </div>
  <p style="font-size:12px;color:rgba(25,20,16,0.55);text-align:center;margin:18px 0 0">LA SUNSHINES — soirées 12–17 ans en Guadeloupe.</p>
</div></div></body></html>`;
}

export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL || 'https://la-sunshines.vercel.app'
  ).replace(/\/$/, '');
}
