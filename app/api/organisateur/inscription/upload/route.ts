import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { blobConfigured } from '@/lib/blob';
import { getSession } from '@/lib/auth/roles';
import { supabaseConfigured } from '@/lib/supabase/config';
import { docOk } from '@/lib/organizer/signup';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
/** Vérifie que le contenu correspond au type annoncé (le type envoyé par le navigateur ne suffit pas). */
function magicOk(type: string, b: Uint8Array): boolean {
  if (type === 'application/pdf') return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  if (type === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8;
  if (type === 'image/png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (type === 'image/webp') return b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45;
  return false;
}

// POST (multipart, champ « file ») — dépose une pièce du dossier d'inscription dans un stockage PRIVÉ (jamais d'URL publique) ; relue seulement par un admin (/api/admin-gestion/org-document).
export async function POST(req: Request) {
  if (!supabaseConfigured()) return NextResponse.json({ error: 'Indisponible.' }, { status: 503 });
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
  if (!(await rateLimit(`org-doc:${s.userId}:${clientIp(req)}`, 20, 3600)).ok) return NextResponse.json({ error: 'Trop d’envois. Réessaie plus tard.' }, { status: 429 });
  if (!blobConfigured()) return NextResponse.json({ error: 'Le dépôt de fichiers n’est pas encore configuré.' }, { status: 503 });
  const f = (await req.formData().catch(() => null))?.get('file');
  if (!(f instanceof File)) return NextResponse.json({ error: 'Fichier manquant.' }, { status: 400 });
  if (!docOk(f.type, f.size)) return NextResponse.json({ error: 'Fichier refusé : PDF, JPEG, PNG ou WebP, 10 Mo maximum.' }, { status: 400 });
  const head = new Uint8Array(await f.slice(0, 16).arrayBuffer());
  if (!magicOk(f.type, head)) return NextResponse.json({ error: 'Le contenu du fichier ne correspond pas à son type.' }, { status: 400 });
  try {
    const res = await put(`orgdocs/${randomUUID()}.${EXT[f.type]}`, f, { access: 'private', addRandomSuffix: false, contentType: f.type });
    return NextResponse.json({ path: res.pathname, name: f.name.slice(0, 120), size: f.size, mime: f.type });
  } catch { return NextResponse.json({ error: 'Envoi impossible. Réessaie.' }, { status: 502 }); }
}
