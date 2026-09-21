import { NextResponse } from 'next/server';
import { requireOrganizerApi } from '@/lib/organizer/access';
import { analyzeFlyer, mistralConfigured } from '@/lib/flyerAI';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { image: dataURL } — pré-remplissage de la création d'évènement depuis le flyer (analyse IA existante). Suggestion uniquement : l'organisateur relit et corrige.
export async function POST(req: Request) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  if (!(await rateLimit(`flyer-ai:${g.s.userId}:${clientIp(req)}`, 10, 3600)).ok) return NextResponse.json({ error: 'Trop d’analyses. Réessaie plus tard.' }, { status: 429 });
  if (!mistralConfigured()) return NextResponse.json({ error: 'L’analyse du flyer n’est pas disponible pour l’instant.' }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { image?: unknown } | null;
  const image = typeof body?.image === 'string' ? body.image : '';
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > 6_000_000) return NextResponse.json({ error: 'Choisis un flyer JPEG, PNG ou WebP de 4 Mo maximum.' }, { status: 400 });
  try { return NextResponse.json({ ok: true, data: await analyzeFlyer(image) }); }
  catch { return NextResponse.json({ error: 'Analyse du flyer impossible pour l’instant.' }, { status: 502 }); }
}
