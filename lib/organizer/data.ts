// Appels aux fonctions SQL org_* (service role) : chacune revérifie l'accès de l'acteur (membre de l'organisateur de
// l'événement, ou admin) et journalise dans audit_log. SERVEUR UNIQUEMENT.

import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getAllEditions } from '@/lib/content';

export interface OrgFailure { status: number; message: string }
export type OrgResult<T> = { ok: true; data: T } | { ok: false; error: OrgFailure };

const MESSAGES: Record<string, OrgFailure> = {
  FORBIDDEN: { status: 403, message: 'Accès refusé.' },
  EVENT_NOT_FOUND: { status: 404, message: 'Événement introuvable.' },
  TICKET_NOT_FOUND: { status: 404, message: 'Billet introuvable pour cet événement.' },
  BAD_FILTER: { status: 400, message: 'Filtre invalide.' },
  BAD_SCOPE: { status: 400, message: 'Choix de destinataires invalide.' },
  BAD_ACTION: { status: 400, message: 'Action invalide.' },
  EMPTY_MESSAGE: { status: 400, message: 'L’objet et le message sont obligatoires.' },
  NO_RECIPIENTS: { status: 400, message: 'Aucun destinataire pour ce choix.' },
  TOO_MANY_RECIPIENTS: { status: 400, message: 'Trop de destinataires (500 maximum par message).' },
  RATE_LIMIT: { status: 429, message: 'Limite atteinte : 3 messages maximum par événement et par 24 heures.' },
  ORG_NAME_REQUIRED: { status: 400, message: 'Le nom de la structure est obligatoire.' },
  BAD_SIRET: { status: 400, message: 'Le SIRET doit comporter 14 chiffres.' },
  STRIPE_ACCOUNT_LOCKED: { status: 409, message: 'Un compte Stripe est déjà lié à cette organisation.' },
  BAD_EMAIL: { status: 400, message: 'Adresse email invalide.' },
  BAD_FIELD: { status: 400, message: 'Champ non modifiable.' },
  BAD_PATCH: { status: 400, message: 'Requête invalide.' },
  BAD_VISIBILITY: { status: 400, message: 'Visibilité invalide.' },
  BAD_PUBLISH: { status: 400, message: 'Mode de publication invalide.' },
  BAD_URL: { status: 400, message: 'Adresse de fichier invalide.' },
  BAD_STATUS: { status: 400, message: 'Statut invalide.' },
  VENUE_NOT_FOUND: { status: 404, message: 'Lieu introuvable.' },
  SESSION_NOT_FOUND: { status: 404, message: 'Session introuvable.' },
  CONFIRM_DATE_CHANGE: { status: 409, message: 'Les ventes sont ouvertes : confirme le changement de date (les acheteurs verront la nouvelle date).' },
  REPLY_TO_MISSING: { status: 409, message: 'L’organisateur n’a pas d’adresse de réponse : [À COMPLÉTER] dans les informations de l’organisateur.' },
};

export function mapOrgError(e: { message?: string } | null | undefined): OrgFailure {
  return MESSAGES[e?.message ?? ''] ?? { status: 500, message: 'Erreur inattendue. Réessaie.' };
}

export async function orgRpc<T>(fn: string, args: Record<string, unknown>): Promise<OrgResult<T>> {
  const { data, error } = await createSupabaseAdminClient().rpc(fn, args);
  if (error) {
    if (!MESSAGES[error.message]) console.error(`[organisateur] ${fn} :`, error.message);
    return { ok: false, error: mapOrgError(error) };
  }
  return { ok: true, data: data as T };
}

// ---------------------------------------------------------------- types
export interface OrgEventRow {
  slug: string; status: string; ticketing_enabled: boolean; starts_at: string; venue_name: string; capacity: number;
  sold: number; reserved: number; entered: number; organizer_id: string; organizer_name: string;
  my_role: string; archived: boolean; revenue_cents: number | null;
}
export interface OrgAccountRow {
  id: string; name: string; my_role: 'admin' | 'owner' | 'manager' | 'staff';
  reference: string | null; account_status: 'pending' | 'approved' | 'suspended';
  legal_form: string | null; siret: string | null; responsible_name: string | null; address: string | null; contact_email: string | null;
  stripe_connected: boolean | null; stripe_ready: boolean | null;
}
export interface OrgTierStat { tier_id: string; name: string; price_cents: number; quantity_total: number; archived: boolean; sold: number; reserved: number; revenue_cents: number }
export interface OrgStats {
  slug: string; status: string; ticketing_enabled: boolean; starts_at: string; venue_name: string; venue_address: string; capacity: number;
  organizer: { id: string; name: string; contact_email: string }; my_role: string;
  sold: number; reserved: number; remaining: number; entered: number; revenue_cents: number; refunded_cents: number; fill_rate: number;
  tiers: OrgTierStat[]; series: { day: string; sold: number; revenue_cents: number }[];
}
export interface OrgParticipant {
  id: string; reference: string; holder_first_name: string; holder_last_name: string; status: string; used_at: string | null; created_at: string;
  order_number: string; order_id: string; buyer_email: string; buyer_phone: string; source: string; tier_name: string; unit_price_cents: number; tier_id: string;
}

/** Titre, flyer et lieu éditoriaux d'un événement (getAllEditions, masqués inclus). */
export function editorial(slug: string): { title: string; flyer: string | null; dateLabel: string } {
  const e = getAllEditions({ includeHidden: true }).find((x) => x.slug === slug);
  return { title: e?.name ?? slug, flyer: e?.flyer ?? null, dateLabel: e?.dateFull ?? '' };
}

export interface OrgTierFull {
  id: string; name: string; description: string; price_cents: number; quantity_total: number; max_per_order: number;
  sales_start: string | null; sales_end: string | null; is_active: boolean; archived: boolean; sort_order: number; sold: number; consumed: number;
}
export interface OrgTiers { capacity: number; consumed: number; tiers: OrgTierFull[] }
export interface OrgBrief { id: string; slug: string; starts_at: string; venue_name: string; organizer_name: string; my_role: string }
