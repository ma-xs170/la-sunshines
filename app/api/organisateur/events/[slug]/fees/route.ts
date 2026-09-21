import { z } from 'zod';
import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc } from '@/lib/organizer/data';
import { SLUG_RE } from '@/lib/ticketing/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const body = z.object({ mode: z.enum(['customer', 'included']), min_order_cents: z.number().int().min(0).max(100000) });

// PUT /api/organisateur/events/[slug]/fees — mode de frais (payés par le client / inclus dans le prix) et montant minimum de commande.
// Gestionnaire, propriétaire ou admin (revérifié en SQL) ; journalisé. Les pourcentages et frais fixes ne se règlent que côté admin.
export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireOrganizerApi(); if (!g.ok) return g.res;
  const { slug } = await params;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!SLUG_RE.test(slug) || !p.success) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  const r = await orgRpc('org_set_fee_settings', { p_actor: g.s.userId, p_slug: slug, p_mode: p.data.mode, p_min_order_cents: p.data.min_order_cents });
  return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error.message }, { status: r.error.status });
}
