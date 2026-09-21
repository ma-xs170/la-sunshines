import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc } from '@/lib/organizer/data';
import { csvResponse, toCsv } from '@/lib/ticketing/csv';
import { SLUG_RE } from '@/lib/ticketing/schemas';
import { formatPrice } from '@/lib/ticketing/time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS: Record<string, string> = { valid: 'Valide', used: 'Entré', cancelled: 'Annulé', refunded: 'Remboursé' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/organisateur/events/[slug]/export?tier=&status= — CSV des participants.
// Réservé aux rôles owner / manager / admin (revérifié dans la fonction SQL) ; CHAQUE export est écrit dans audit_log.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return Response.json({ error: 'Événement introuvable.' }, { status: 404 });
  const u = new URL(req.url);
  const tier = u.searchParams.get('tier');
  const status = u.searchParams.get('status');
  if ((tier && !UUID.test(tier)) || (status && !STATUS[status])) return Response.json({ error: 'Filtre invalide.' }, { status: 400 });

  const r = await orgRpc<Record<string, string | number | null>[]>('org_export_participants', { p_actor: g.s.userId, p_slug: slug, p_tier: tier || null, p_status: status || null });
  if (!r.ok) return Response.json({ error: r.error.message }, { status: r.error.status });
  const rows = r.data.map((p) => [p.reference, p.first_name, p.last_name, p.email, p.phone, p.tier, formatPrice(Number(p.price_cents)), Number(p.price_cents) === 0 ? 'Gratuit' : 'Payant', STATUS[String(p.status)] ?? p.status, p.entered_at ?? '', p.order_number, p.source === 'manual' ? 'Invitation' : 'Web']);
  return csvResponse(`participants-${slug}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(['Référence', 'Prénom', 'Nom', 'Email', 'Téléphone', 'Tarif', 'Prix', 'Type', 'Statut', 'Entré le', 'Commande', 'Origine'], rows));
}
