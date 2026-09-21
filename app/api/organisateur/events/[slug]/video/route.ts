import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc } from '@/lib/organizer/data';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { SLUG_RE } from '@/lib/ticketing/schemas';
import { revalidatePublicSite } from '@/lib/revalidate';
import { decideVideoPlan, VIDEO_CONFIG } from '@/lib/videoRules';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BLOB_HOST = /^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//;

// POST — deux usages :
//  1. jeton d'envoi direct navigateur → Vercel Blob (type `blob.generate-client-token`) : accordé seulement à un organisateur autorisé sur CET évènement,
//     formats et taille plafonnés par lib/videoRules.ts ;
//  2. { url, width, height, seconds, bytes, fps?, poster? } : enregistre la vidéo envoyée et décide du traitement (règles 1080p / 60 i/s).
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
      const res = await handleUpload({
        request: req, body: body as HandleUploadBody,
        onBeforeGenerateToken: async (pathname) => {
          if (!pathname.startsWith(`evenements/${slug}/`)) throw new Error('Chemin refusé.');
          return { allowedContentTypes: [...VIDEO_CONFIG.formats, 'image/jpeg', 'image/webp'], maximumSizeInBytes: VIDEO_CONFIG.maxBytes, addRandomSuffix: true };
        },
        onUploadCompleted: async () => { /* l'enregistrement se fait par l'appel 2 (fonctionne aussi en local) */ },
      });
      return Response.json(res);
    } catch { return Response.json({ error: 'Envoi refusé.' }, { status: 400 }); }
  }

  const p = z.object({ url: z.string().regex(BLOB_HOST), poster: z.string().regex(BLOB_HOST).nullable().optional(),
    width: z.number().positive(), height: z.number().positive(), seconds: z.number().positive(), bytes: z.number().positive(), fps: z.number().positive().max(240).optional() }).safeParse(body);
  if (!p.success) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  const v = p.data;
  const plan = decideVideoPlan({ width: v.width, height: v.height, seconds: v.seconds, bytes: v.bytes, fps: v.fps ?? 30, codec: 'inconnu', hasAudio: true });
  if (!plan.ok) return Response.json({ error: plan.error }, { status: 400 });
  const reg = await orgRpc<string>('org_media_register', { p_actor: g.s.userId, p_slug: slug, p_source_url: v.url, p_meta: { width: v.width, height: v.height, seconds: v.seconds, bytes: v.bytes, plan: plan.action } });
  if (!reg.ok) return Response.json({ error: reg.error.message }, { status: reg.error.status });
  // Conforme (≤ 1080p, ≤ 60 i/s) : diffusable telle quelle, pas de ré-encodage. Sinon elle reste « envoyée » jusqu'au passage du job de transcodage.
  const admin = createSupabaseAdminClient();
  if (plan.action === 'optimize') {
    await admin.rpc('media_set_status', { p_id: reg.data, p_status: 'ready', p_h264: v.url, p_poster: v.poster ?? null });
    revalidatePublicSite();
  }
  return Response.json({ ok: true, id: reg.data, status: plan.action === 'optimize' ? 'ready' : 'uploaded', action: plan.action });
}
