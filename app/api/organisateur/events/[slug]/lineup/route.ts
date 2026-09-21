import { z } from 'zod';
import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc } from '@/lib/organizer/data';
import { SLUG_RE } from '@/lib/ticketing/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const iso = z.string().refine((v) => v === '' || !Number.isNaN(Date.parse(v)), 'Heure invalide.').nullable().optional();
const body = z.object({ items: z.array(z.object({
  name: z.string().trim().min(1, 'Un nom est obligatoire.').max(80), role: z.enum(['dj', 'artiste', 'invité', 'animateur', 'autre']), starts_at: iso, ends_at: iso,
})).max(60) });

// PUT /api/organisateur/events/[slug]/lineup — remplace tout le lineup (l'ordre du tableau = l'ordre d'affichage). Gestionnaire / propriétaire / admin ; journalisé.
export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireOrganizerApi(); if (!g.ok) return g.res;
  const { slug } = await params;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!SLUG_RE.test(slug) || !p.success) return Response.json({ error: p.success ? 'Requête invalide.' : p.error.issues[0]?.message ?? 'Requête invalide.' }, { status: 400 });
  const r = await orgRpc<number>('org_lineup_save', { p_actor: g.s.userId, p_slug: slug, p_items: p.data.items });
  return r.ok ? Response.json({ ok: true, count: r.data }) : Response.json({ error: r.error.message }, { status: r.error.status });
}
