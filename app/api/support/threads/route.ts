import { NextResponse } from 'next/server';
import { createSchema } from '@/lib/support';
import { requireSupportSession, supportRpc } from '@/lib/supportServer';
import { mailButton, mailConfigured, mailLayout, mailScript, sendMail, siteUrl } from '@/lib/mail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// POST — crée un ticket (organisateur owner / manager de l'organisation `org`, revérifié en SQL) et envoie un accusé de réception à son auteur.
export async function POST(req: Request) {
  const g = await requireSupportSession(); if (!g.ok) return g.res;
  const p = createSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? 'Requête invalide.' }, { status: 400 });
  const v = p.data;
  const r = await supportRpc<{ id: string; reference: string }>('support_create', { p_actor: g.s.userId, p_org: v.org, p_subject: v.subject, p_category: v.category, p_priority: v.priority, p_body: v.body, p_attachments: v.attachments, p_context: v.context ?? {} });
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });
  if (mailConfigured() && g.s.email) await sendMail({ to: g.s.email, subject: `Ticket ${r.data.reference} bien reçu`, html: mailLayout(
    `${mailScript('Demande bien reçue')}<h2>${r.data.reference}</h2>
     <p>Nous avons bien reçu ta demande <strong>${esc(v.subject)}</strong>.</p>
     <p style="margin:24px 0">${mailButton(`${siteUrl()}/organisateur/support`, 'Suivre la discussion')}</p>
     <p style="font-size:13px;color:#8a8378">Tu peux suivre la discussion dans l’espace organisateur, rubrique Support.</p>`,
  ) });
  return NextResponse.json({ ok: true, ...r.data });
}
