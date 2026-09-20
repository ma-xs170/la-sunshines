import { z } from 'zod';
import { requireOrganizerApi } from '@/lib/organizer/access';
import { dashboardLink } from '@/lib/organizer/stripe-connect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// POST { org } — propriétaire ou admin de l'organisation (revérifié en SQL). Le compte Stripe n'est JAMAIS lu depuis la requête.
export async function POST(req: Request) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  const body = z.object({ org: z.uuid() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  const r = await dashboardLink(g.s.userId, body.data.org);
  if (!r.ok) return Response.json({ error: r.error.message }, { status: r.error.status });
  return Response.json(r.data);
}
