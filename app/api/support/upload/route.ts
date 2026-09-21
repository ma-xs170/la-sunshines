import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { attachOk } from '@/lib/support';
import { blobConfigured } from '@/lib/blob';
import { requireSupportSession } from '@/lib/supportServer';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST (multipart, champ « file ») — dépose une pièce jointe dans un stockage PRIVÉ (jamais d'URL publique). Images et PDF, 10 Mo maximum ;
// le fichier n'est relu que par la route /api/support/file, après contrôle d'accès au ticket.
export async function POST(req: Request) {
  const g = await requireSupportSession(); if (!g.ok) return g.res;
  if (!(await rateLimit(`support-up:${g.s.userId}:${clientIp(req)}`, 30, 3600)).ok) return NextResponse.json({ error: 'Trop d’envois. Réessaie plus tard.' }, { status: 429 });
  if (!blobConfigured()) return NextResponse.json({ error: 'Le dépôt de fichiers n’est pas encore configuré.' }, { status: 503 });
  const f = (await req.formData().catch(() => null))?.get('file');
  if (!(f instanceof File)) return NextResponse.json({ error: 'Fichier manquant.' }, { status: 400 });
  if (!attachOk(f.type, f.size)) return NextResponse.json({ error: 'Fichier refusé : images ou PDF, 10 Mo maximum.' }, { status: 400 });
  const ext = f.type === 'application/pdf' ? 'pdf' : f.type.split('/')[1].replace('jpeg', 'jpg');
  try {
    const res = await put(`support/${randomUUID()}.${ext}`, f, { access: 'private', addRandomSuffix: false, contentType: f.type });
    return NextResponse.json({ path: res.pathname, name: f.name.slice(0, 120), size: f.size, type: f.type });
  } catch { return NextResponse.json({ error: 'Envoi impossible. Réessaie.' }, { status: 502 }); }
}
