import { NextResponse } from 'next/server';
import { createSchema } from '@/lib/support';
import { requireSupportSession, supportRpc } from '@/lib/supportServer';
import { mailConfigured, sendMail } from '@/lib/mail';

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
  if (mailConfigured() && g.s.email) await sendMail({ to: g.s.email, subject: `Ticket ${r.data.reference} bien reçu`, html: `<p>Bonjour,</p><p>Nous avons bien reçu ta demande <strong>${esc(v.subject)}</strong>. Référence : <strong>${r.data.reference}</strong>.</p><p>Tu peux suivre la discussion dans l’espace organisateur, rubrique Support.</p>` });
  return NextResponse.json({ ok: true, ...r.data });
}
