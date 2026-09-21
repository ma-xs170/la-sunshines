import { NextResponse } from 'next/server';
import { getBlob } from '@/lib/blob';
import { adminRpc, requireAdminApi } from '@/lib/adminSpace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?id=<pièce> — sert une pièce du dossier d'inscription UNIQUEMENT à un administrateur actif ; chaque consultation est écrite dans le journal d'audit (SQL).
export async function GET(req: Request) {
  const a = await requireAdminApi(); if (!a.ok) return a.res;
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Introuvable.' }, { status: 404 });
  const r = await adminRpc<{ path: string; name: string; mime: string }>('admin_org_document', { p_actor: a.s.userId, p_doc: id });
  if (!r.ok) return NextResponse.json({ error: 'Introuvable.' }, { status: 404 });
  const b = await getBlob(r.data.path); if (!b) return NextResponse.json({ error: 'Fichier introuvable.' }, { status: 404 });
  return new Response(b.stream, { headers: { 'Content-Type': r.data.mime, 'Content-Disposition': `inline; filename="${encodeURIComponent(r.data.name)}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
