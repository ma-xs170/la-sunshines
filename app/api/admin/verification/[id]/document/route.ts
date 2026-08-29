import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { readStore } from '@/lib/store';
import { getBlob } from '@/lib/blob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/verification/:id/document  — streame le document (privé), auth admin.
// Le blob n'est JAMAIS exposé publiquement : il ne sort que par cette route.
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }
  const { id } = await params;
  const store = await readStore();
  const reqItem = store.verificationRequests.find((v) => v.id === id);
  if (!reqItem) {
    return NextResponse.json({ error: 'Demande introuvable.' }, { status: 404 });
  }

  try {
    const blob = await getBlob(reqItem.blobPathname);
    if (!blob) {
      return NextResponse.json({ error: 'Document introuvable.' }, { status: 404 });
    }
    return new Response(blob.stream, {
      headers: {
        'Content-Type': blob.contentType,
        'Content-Disposition': 'inline',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('[verification/document] :', e);
    return NextResponse.json({ error: 'Lecture impossible.' }, { status: 502 });
  }
}
