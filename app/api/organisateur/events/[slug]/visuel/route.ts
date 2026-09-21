import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { z } from 'zod';
import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc } from '@/lib/organizer/data';
import { SLUG_RE } from '@/lib/ticketing/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BLOB_HOST = /^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\/evenements\//;

// POST — deux usages : (1) jeton d'envoi direct navigateur → Vercel Blob (image JPEG / PNG / WebP, 8 Mo, dossier de CET évènement) accordé à un gestionnaire de l'organisation ;
// (2) { url } | { remove: true } : enregistre (ou retire) le visuel de l'évènement (org_set_flyer vérifie le rôle et l'hôte du stockage).
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  const access = await orgRpc('org_event_details', { p_actor: g.s.userId, p_slug: slug });
  if (!access.ok) return Response.json({ error: access.error.message }, { status: access.error.status });
  const body = await req.json().catch(() => null);
  if (body && typeof body === 'object' && 'type' in body) {
    try {
      return Response.json(await handleUpload({
        request: req, body: body as HandleUploadBody,
        onBeforeGenerateToken: async (pathname) => {
          if (!pathname.startsWith(`evenements/${slug}/`)) throw new Error('Chemin refusé.');
          return { allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'], maximumSizeInBytes: 8 * 1024 * 1024, addRandomSuffix: true };
        },
        onUploadCompleted: async () => { /* enregistrement par l'appel 2 (fonctionne aussi en local) */ },
      }));
    } catch { return Response.json({ error: 'Envoi refusé.' }, { status: 400 }); }
  }
  const parsed = z.union([z.object({ url: z.string().url().max(500) }), z.object({ remove: z.literal(true) })]).safeParse(body);
  if (!parsed.success) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  const url = 'url' in parsed.data ? parsed.data.url : null;
  if (url && !BLOB_HOST.test(url)) return Response.json({ error: 'Adresse de fichier invalide.' }, { status: 400 });
  const r = await orgRpc('org_set_flyer', { p_actor: g.s.userId, p_slug: slug, p_url: url });
  return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error.message }, { status: r.error.status });
}
