import { NextResponse } from 'next/server';
import { getBlob } from '@/lib/blob';
import { requireSupportSession, supportRpc } from '@/lib/supportServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?thread=&path= — sert une pièce jointe UNIQUEMENT à un participant du ticket (ou un admin) et seulement si le fichier appartient à ce ticket.
export async function GET(req: Request) {
  const g = await requireSupportSession(); if (!g.ok) return g.res;
  const u = new URL(req.url); const thread = u.searchParams.get('thread') ?? ''; const path = u.searchParams.get('path') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(thread) || !/^support\/[A-Za-z0-9._-]{1,120}$/.test(path)) return NextResponse.json({ error: 'Introuvable.' }, { status: 404 });
  const r = await supportRpc<{ messages: { attachments: { path: string; name: string; type: string }[] }[] }>('support_get', { p_actor: g.s.userId, p_id: thread });
  const att = r.ok ? r.data.messages.flatMap((m) => m.attachments).find((a) => a.path === path) : null;
  if (!att) return NextResponse.json({ error: 'Introuvable.' }, { status: 404 });
  const b = await getBlob(path); if (!b) return NextResponse.json({ error: 'Introuvable.' }, { status: 404 });
  return new Response(b.stream, { headers: { 'Content-Type': att.type, 'Content-Disposition': `inline; filename="${encodeURIComponent(att.name)}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
