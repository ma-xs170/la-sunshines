import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { mistralConfigured, analyzeFlyer } from '@/lib/flyerAI';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/admin/flyer-analyze  — body { image: dataURL }
// -> { ok:true, data:{ headliner, lineup[], date, heure, lieu, dresscode } }
// Suggestion uniquement : le formulaire /admin pré-remplit ces champs, l'admin
// relit et corrige avant d'enregistrer. Aucune publication automatique.
export async function POST(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }
  if (!mistralConfigured()) {
    return NextResponse.json(
      {
        error:
          'Analyse IA indisponible : ajoute MISTRAL_API_KEY dans .env.local puis redémarre le serveur.',
      },
      { status: 503 },
    );
  }

  let body: { image?: unknown };
  try {
    body = (await req.json()) as { image?: unknown };
  } catch {
    return NextResponse.json({ error: 'JSON invalide.' }, { status: 400 });
  }

  const image = typeof body.image === 'string' ? body.image : '';
  if (!image.startsWith('data:image/')) {
    return NextResponse.json(
      { error: 'Aucune image fournie (choisis d’abord un flyer).' },
      { status: 400 },
    );
  }

  try {
    const data = await analyzeFlyer(image);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'erreur inconnue';
    return NextResponse.json(
      { error: `Analyse du flyer impossible : ${msg}` },
      { status: 502 },
    );
  }
}
