import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { clientIp, rateLimit } from '@/lib/rateLimit';
import { SLUG_RE } from '@/lib/ticketing/schemas';
import { sourceOf } from '@/lib/organizer/audience';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/track/view { slug, ref } — compteur d'audience AGRÉGÉ et anonyme : (évènement, jour, canal, pays). Aucune IP, aucun cookie, aucun identifiant
// n'est stocké (l'IP ne sert qu'à la limitation de fréquence, en mémoire de courte durée). Sans base configurée : sans effet.
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { slug?: unknown; ref?: unknown } | null;
  if (!b || typeof b.slug !== 'string' || !SLUG_RE.test(b.slug)) return new Response(null, { status: 204 });
  const rl = await rateLimit(`view:${clientIp(req)}`, 60, 600, { failClosed: false });
  if (!rl.ok) return new Response(null, { status: 204 });
  let host = '';
  try { host = typeof b.ref === 'string' && b.ref ? new URL(b.ref).hostname : ''; } catch { host = ''; }
  const own = new URL(req.url).hostname;
  try {
    await createSupabaseAdminClient().rpc('track_event_view', { p_slug: b.slug, p_source: sourceOf(host, own), p_country: req.headers.get('x-vercel-ip-country') ?? '' });
  } catch { /* jamais bloquant */ }
  return new Response(null, { status: 204 });
}
