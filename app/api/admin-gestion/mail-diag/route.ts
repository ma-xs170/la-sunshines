import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireAdminApi } from '@/lib/adminSpace';
import { fromAddress, mailConfigured, mailLayout, mailScript, readableMailError, sendMail } from '@/lib/mail';
import { rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Domaine de l'adresse d'expédition courante ("LA SUNSHINES <billets@la-sunshines.fr>" → "la-sunshines.fr"). */
function fromDomain(): string | null {
  const m = fromAddress().match(/<([^@>]+)@([^>]+)>|^([^@\s]+)@(\S+)$/);
  return (m?.[2] || m?.[4] || '').toLowerCase() || null;
}

// GET — état de la configuration e-mail : clé Resend présente, adresse d'expédition, domaine vérifié ou non chez Resend.
export async function GET() {
  const g = await requireAdminApi(); if (!g.ok) return g.res;
  const from = fromAddress();
  const domain = fromDomain();
  const usingFallback = !process.env.MAIL_FROM;
  const base = { resendConfigured: mailConfigured(), from, domain, usingFallback };
  if (!mailConfigured()) return NextResponse.json({ ...base, domainStatus: null, domainError: 'RESEND_API_KEY absente : aucun envoi n’est possible.' });
  if (usingFallback) return NextResponse.json({ ...base, domainStatus: null, domainError: 'MAIL_FROM non réglée : les e-mails partent depuis un domaine de test Resend (livrés uniquement à l’adresse de ton propre compte Resend).' });
  try {
    const { data, error } = await new Resend(process.env.RESEND_API_KEY!).domains.list();
    if (error) return NextResponse.json({ ...base, domainStatus: null, domainError: readableMailError(error) });
    const found = data?.data.find((d) => d.name.toLowerCase() === domain);
    if (!found) return NextResponse.json({ ...base, domainStatus: null, domainError: `Domaine « ${domain} » introuvable dans ce compte Resend : ajoute-le sur resend.com/domains.` });
    return NextResponse.json({ ...base, domainStatus: found.status, domainError: found.status === 'verified' ? null : `Domaine « ${domain} » : statut « ${found.status} » (pas encore vérifié — vérifie les enregistrements DNS sur resend.com/domains).` });
  } catch (e) {
    return NextResponse.json({ ...base, domainStatus: null, domainError: e instanceof Error ? e.message : 'Vérification du domaine impossible.' });
  }
}

// POST { action: 'test' } — envoie un e-mail de test à SA PROPRE adresse (l'administrateur connecté). Journalisé par la limitation de fréquence (5 / heure).
export async function POST(req: Request) {
  const g = await requireAdminApi(); if (!g.ok) return g.res;
  const body = await req.json().catch(() => null) as { action?: string } | null;
  if (body?.action !== 'test') return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  if (!g.s.email) return NextResponse.json({ error: 'Ton compte n’a pas d’adresse e-mail.' }, { status: 400 });
  if (!(await rateLimit(`mail-test:${g.s.userId}`, 5, 3600)).ok) return NextResponse.json({ error: 'Trop d’essais : réessaie dans une heure.' }, { status: 429 });
  const r = await sendMail({
    to: g.s.email,
    subject: 'E-mail de test — LA SUNSHINES',
    html: mailLayout(
      `${mailScript('Test de configuration')}<h2>Ça fonctionne</h2>
       <p>Cet e-mail confirme que l’envoi depuis <strong>${fromAddress()}</strong> arrive bien jusqu’à toi.</p>
       <p style="font-size:13px;color:#8a8378">Envoyé depuis Réglages → E-mails, à la demande de ${g.s.email}.</p>`,
    ),
  });
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.message }, { status: 502 });
}
