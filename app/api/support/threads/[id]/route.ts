import { NextResponse } from 'next/server';
import { actionSchema } from '@/lib/support';
import { requireSupportSession, supportRpc } from '@/lib/supportServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET ?after=<id> — messages depuis l'id donné (interrogé toutes les 2 s par le chat). Les notes internes ne sortent que pour un admin (filtré en SQL).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireSupportSession(); if (!g.ok) return g.res;
  const { id } = await params; if (!UUID.test(id)) return NextResponse.json({ error: 'Ticket introuvable.' }, { status: 404 });
  const after = Number(new URL(req.url).searchParams.get('after')) || 0;
  const r = await supportRpc('support_get', { p_actor: g.s.userId, p_id: id, p_after: after });
  return r.ok ? NextResponse.json(r.data, { headers: { 'Cache-Control': 'no-store' } }) : NextResponse.json({ error: r.message }, { status: r.status });
}

// POST { action: post | add | claim | transfer | close | reopen } — les droits (participant / admin actif) sont revérifiés en SQL.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireSupportSession(); if (!g.ok) return g.res;
  const { id } = await params; if (!UUID.test(id)) return NextResponse.json({ error: 'Ticket introuvable.' }, { status: 404 });
  const p = actionSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? 'Requête invalide.' }, { status: 400 });
  const a = p.data; const actor = g.s.userId;
  const r = a.action === 'post' ? await supportRpc('support_post', { p_actor: actor, p_id: id, p_body: a.body, p_attachments: a.attachments, p_internal: a.internal === true })
    : a.action === 'add' ? await supportRpc('support_add_participant', { p_actor: actor, p_id: id, p_ref: a.ref })
    : a.action === 'claim' ? await supportRpc('support_claim', { p_actor: actor, p_id: id })
    : a.action === 'transfer' ? await supportRpc('support_transfer', { p_actor: actor, p_id: id, p_to_admin: a.to })
    : a.action === 'close' ? await supportRpc('support_close', { p_actor: actor, p_id: id, p_note: a.note })
    : await supportRpc('support_reopen', { p_actor: actor, p_id: id });
  return r.ok ? NextResponse.json({ ok: true, result: r.data ?? null }) : NextResponse.json({ error: r.message }, { status: r.status });
}
