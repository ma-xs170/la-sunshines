// Envoi d'emails transactionnels (Resend). Best-effort : un échec est logué,
// jamais propagé — l'action métier ne doit pas échouer parce qu'un mail n'est
// pas parti.

import { Resend } from 'resend';

// Expéditeur par défaut tant que MAIL_FROM n'est pas réglé : un domaine Resend « bac à sable » qui n'envoie
// qu'à l'adresse du compte Resend lui-même (aucune livraison réelle aux destinataires). MAIL_FROM (ex.
// "LA SUNSHINES <billets@la-sunshines.fr>") doit pointer vers un domaine VÉRIFIÉ dans Resend pour livrer partout.
export const FALLBACK_FROM = 'LA SUNSHINES <onboarding@resend.dev>';
export const fromAddress = () => process.env.MAIL_FROM || FALLBACK_FROM;

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
  /** Expéditeur explicite (par défaut : MAIL_FROM, ou le domaine bac à sable si non réglé). */
  from?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, message: 'RESEND_API_KEY absente.' };
  try {
    const { error } = await new Resend(key).emails.send({
      from: opts.from || fromAddress(),
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      headers: opts.headers,
      replyTo: opts.replyTo,
    });
    if (error) { console.error('[mail] échec envoi :', error.name, error.message); return { ok: false, message: readableMailError(error) }; }
    return { ok: true };
  } catch (e) {
    console.error('[mail] échec envoi :', e instanceof Error ? e.message : e);
    return { ok: false, message: 'Erreur inattendue lors de l’envoi.' };
  }
}

/** Message d'erreur lisible pour l'admin (jamais le détail brut de l'API, jamais de secret). */
export function readableMailError(error: { name?: string; message?: string } | null | undefined): string {
  const m = (error?.message ?? '').toLowerCase();
  if (error?.name === 'validation_error' && m.includes('domain')) return 'Domaine d’envoi non vérifié dans Resend : vérifie MAIL_FROM et le domaine associé sur resend.com/domains.';
  if (error?.name === 'invalid_api_key' || m.includes('api key')) return 'Clé Resend invalide ou expirée : vérifie RESEND_API_KEY.';
  if (error?.name === 'rate_limit_exceeded' || m.includes('rate limit') || m.includes('too many')) return 'Limite d’envoi Resend atteinte pour le moment : réessaie dans quelques minutes.';
  if (m.includes('from') && (m.includes('not verified') || m.includes('domain'))) return 'L’adresse d’expédition (MAIL_FROM) n’est pas vérifiée dans Resend.';
  if (error?.name || error?.message) return `Envoi refusé par Resend (${error.name ?? 'erreur'}).`;
  return 'Envoi impossible pour le moment.';
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
