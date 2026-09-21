import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc } from '@/lib/organizer/data';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { loadTicketPages } from '@/lib/ticketing/pdf/data';
import { renderTicketsPdf } from '@/lib/ticketing/pdf/render';
import { SLUG_RE } from '@/lib/ticketing/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/organisateur/events/[slug]/print?tier=<id> — PDF des billets VALIDES (300 au maximum par fichier), un billet par page.
// Gestionnaire / propriétaire / admin (revérifié en SQL) ; chaque impression est journalisée.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireOrganizerApi(); if (!g.ok) return g.res;
  const { slug } = await params;
  const tier = new URL(req.url).searchParams.get('tier') ?? '';
  if (!SLUG_RE.test(slug) || (tier && !UUID.test(tier))) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  const r = await orgRpc<{ total: number; ids: string[] }>('org_print_ticket_ids', { p_actor: g.s.userId, p_slug: slug, p_tier: tier || null, p_limit: 300 });
  if (!r.ok) return Response.json({ error: r.error.message }, { status: r.error.status });
  if (r.data.ids.length === 0) return Response.json({ error: 'Aucun billet valide à imprimer.' }, { status: 404 });
  const db = createSupabaseAdminClient();
  const pages = (await Promise.all(r.data.ids.map((id) => loadTicketPages(db, { ticketId: id })))).flat();
  if (pages.length === 0) return Response.json({ error: 'Aucun billet valide à imprimer.' }, { status: 404 });
  const pdf = await renderTicketsPdf(pages, `Billets ${slug}`);
  await orgRpc('org_log', { p_actor: g.s.userId, p_slug: slug, p_action: 'organizer.tickets_print', p_meta: { count: pages.length, total: r.data.total, tier: tier || null } });
  return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="billets-${slug}.pdf"`, 'Cache-Control': 'no-store' } });
}
