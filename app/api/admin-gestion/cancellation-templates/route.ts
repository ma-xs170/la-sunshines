import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminRpc, requireAdminApi } from '@/lib/adminSpace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  reason: z.enum(['weather', 'permit', 'low_sales', 'other']),
  subject: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1800),
});

// POST { reason, subject, body } — modèle d'excuse PAR DÉFAUT du site pour une raison d'annulation (utilisé quand
// l'organisation n'a pas sa propre version). Pris en compte tout de suite, sans redéploiement.
export async function POST(req: Request) {
  const g = await requireAdminApi();
  if (!g.ok) return g.res;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  const r = await adminRpc('admin_save_cancellation_template', { p_actor: g.s.userId, p_reason: parsed.data.reason, p_subject: parsed.data.subject, p_body: parsed.data.body });
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.message }, { status: r.status });
}
