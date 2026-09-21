import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc } from '@/lib/organizer/data';
import { csvResponse, toCsv } from '@/lib/ticketing/csv';
import { SLUG_RE } from '@/lib/ticketing/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const eur = (c: number) => (c / 100).toFixed(2).replace('.', ',');
// GET — récapitulatif financier en CSV (owner / admin, revérifié en SQL ; la consultation est journalisée).
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireOrganizerApi(); if (!g.ok) return g.res;
  const { slug } = await params; if (!SLUG_RE.test(slug)) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  const r = await orgRpc<Record<string, number>>('org_finance', { p_actor: g.s.userId, p_slug: slug });
  if (!r.ok) return Response.json({ error: r.error.message }, { status: r.error.status });
  const f = r.data;
  return csvResponse(`finance-${slug}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(['Rubrique', 'Montant (€)'], [
    ['Recette brute', eur(f.gross_cents)], ['Frais de service', eur(f.fees_cents)], ['Remboursements', eur(f.refunded_cents)], ['Recette nette', eur(f.net_cents)], ['Déjà versé', eur(f.paid_out_cents)], ['Reste à verser', eur(f.remaining_cents)]]));
}
