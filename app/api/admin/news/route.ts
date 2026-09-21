import { z } from 'zod';
import { requireBilletterieAdmin } from '@/lib/ticketing/guard';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { cleanNewsBody, cleanNewsTitle, isNewsCategory, safeImageUrl, BODY_MAX, TITLE_MAX } from '@/lib/news/text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  id: z.uuid().nullable().optional(),
  title: z.string().max(TITLE_MAX * 3),
  category: z.string().refine(isNewsCategory, 'Catégorie invalide.'),
  body: z.string().max(BODY_MAX * 2),
  image_url: z.string().max(600).nullable().optional(),
  status: z.enum(['draft', 'published']),
  pinned: z.boolean(),
});

// GET — toutes les publications (brouillons compris). Réservé au rôle « admin » (compte Supabase).
export async function GET() {
  const g = await requireBilletterieAdmin();
  if (!g.ok) return g.res;
  const { data, error } = await createSupabaseAdminClient().rpc('news_admin_list', { p_actor: g.actor });
  if (error) return Response.json({ error: 'Impossible de charger les actualités.' }, { status: 500 });
  return Response.json(data);
}

// PUT — crée (sans id) ou modifie. Le contenu est nettoyé (texte simple, aucun HTML) ; l'image doit être une URL https.
export async function PUT(req: Request) {
  const g = await requireBilletterieAdmin();
  if (!g.ok) return g.res;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Requête invalide.' }, { status: 400 });
  const v = parsed.data;
  const title = cleanNewsTitle(v.title), body = cleanNewsBody(v.body);
  if (!title || !body) return Response.json({ error: 'Le titre et le contenu sont obligatoires.' }, { status: 400 });
  const rawImg = (v.image_url ?? '').trim();
  const image = safeImageUrl(rawImg);
  if (rawImg && !image) return Response.json({ error: 'L’image doit être une adresse https:// valide.' }, { status: 400 });
  const { data, error } = await createSupabaseAdminClient().rpc('news_admin_save', {
    p_actor: g.actor, p_id: v.id ?? null, p_title: title, p_category: v.category, p_body: body, p_image_url: image, p_status: v.status, p_pinned: v.pinned,
  });
  if (error) {
    if (error.message === 'POST_NOT_FOUND') return Response.json({ error: 'Publication introuvable.' }, { status: 404 });
    if (error.message === 'FORBIDDEN') return Response.json({ error: 'Accès refusé.' }, { status: 403 });
    console.error('[news] save :', error.message);
    return Response.json({ error: 'Enregistrement impossible.' }, { status: 500 });
  }
  return Response.json({ ok: true, id: data });
}
