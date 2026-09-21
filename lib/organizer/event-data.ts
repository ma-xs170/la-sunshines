// Chargement générique d'une page évènement adossée à une fonction SQL org_* (rôle et organisation revérifiés en SQL).
import 'server-only';
import { forbidden, notFound, redirect } from 'next/navigation';
import { getOrgSession } from './access';
import { editorial, orgRpc } from './data';
import { SLUG_RE } from '@/lib/ticketing/schemas';

export async function orgEventRpc<T>(slug: string, next: string, fn: string, extra: Record<string, unknown> = {}) {
  if (!SLUG_RE.test(slug)) notFound();
  const s = await getOrgSession();
  if (!s) redirect(`/connexion?next=${encodeURIComponent(next)}`);
  if (!s.hasAccess) forbidden();
  const r = await orgRpc<T>(fn, { p_actor: s.userId, p_slug: slug, ...extra });
  if (!r.ok) notFound();   // interdit et introuvable : même réponse, on ne révèle rien
  return { s, data: r.data, title: editorial(slug).title };
}

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
export const ORDER_STATUS: Record<string, string> = { paid: 'Payée', pending: 'En attente', expired: 'Expirée', cancelled: 'Annulée', partially_refunded: 'Partiellement remboursée', refunded: 'Remboursée' };
export const REFUND_STATUS: Record<string, string> = { pending: 'En attente', succeeded: 'Approuvée', failed: 'Refusée' };
