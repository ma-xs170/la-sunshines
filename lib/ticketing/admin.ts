// Opérations d'ADMINISTRATION de la billetterie. SERVEUR UNIQUEMENT.
//
// Toutes passent par des fonctions SQL SECURITY DEFINER (admin_*) appelées avec
// la service role : verrou d'événement, plancher de stock, archivage et écriture
// dans audit_log dans la MÊME transaction. La route appelante a déjà exigé le
// rôle admin Supabase (requireApiRole('admin')) ; la fonction SQL le revérifie.

import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { EventSaveInput, SettingInput, TierSaveInput } from './schemas';

export interface AdminFailure {
  status: number;
  message: string;
}

interface DbError {
  message?: string;
  code?: string;
  details?: string | null;
}

/** Traduit une erreur Postgres / fonction SQL en réponse HTTP lisible (français). */
export function mapDbError(e: DbError): AdminFailure {
  const msg = e.message ?? '';
  const floor = e.details && /^\d+$/.test(e.details) ? Number(e.details) : null;
  switch (msg) {
    case 'FORBIDDEN':
      return { status: 403, message: 'Accès refusé.' };
    case 'EVENT_NOT_FOUND':
      return { status: 404, message: 'Configure d’abord la billetterie de cet événement.' };
    case 'TIER_NOT_FOUND':
      return { status: 404, message: 'Tarif introuvable.' };
    case 'TIER_ARCHIVED':
      return { status: 409, message: 'Ce tarif est archivé : il ne peut plus être modifié.' };
    case 'QUANTITY_BELOW_SOLD':
      return {
        status: 409,
        message: `Impossible : ${floor ?? 'des'} place(s) sont déjà vendues ou réservées en cours. La quantité doit être d’au moins ${floor ?? 'ce nombre'}.`,
      };
    case 'CAPACITY_BELOW_SOLD':
      return {
        status: 409,
        message: `Impossible : ${floor ?? 'des'} place(s) sont déjà vendues ou réservées en cours. La capacité doit être d’au moins ${floor ?? 'ce nombre'}.`,
      };
    case 'UNKNOWN_SETTING':
      return { status: 404, message: 'Réglage inconnu.' };
  }
  if (e.code === '23514') return { status: 400, message: 'Valeurs invalides (prix minimum 0,50 €, dates cohérentes…).' };
  if (e.code === '23505') return { status: 409, message: 'Un tarif porte déjà ce nom pour cet événement.' };
  console.error('[ticketing/admin] erreur inattendue :', e);
  return { status: 500, message: 'Erreur inattendue. Réessaie.' };
}

type Result<T> = { ok: true; data: T } | { ok: false; error: AdminFailure };

export async function adminSaveEvent(actor: string, slug: string, v: EventSaveInput): Promise<Result<string>> {
  const { data, error } = await createSupabaseAdminClient().rpc('admin_save_event', {
    p_actor: actor,
    p_slug: slug,
    p_starts_at: v.starts_at,
    p_ends_at: v.ends_at,
    p_doors_open_at: v.doors_open_at,
    p_venue_name: v.venue_name,
    p_venue_address: v.venue_address,
    p_capacity: v.capacity,
    p_sales_open_at: v.sales_open_at,
    p_sales_close_at: v.sales_close_at,
    p_ticketing_enabled: v.ticketing_enabled,
    p_status: v.status,
  });
  if (error) return { ok: false, error: mapDbError(error) };
  return { ok: true, data: data as string };
}

export async function adminSaveTier(actor: string, slug: string, v: TierSaveInput): Promise<Result<string>> {
  const { data, error } = await createSupabaseAdminClient().rpc('admin_save_tier', {
    p_actor: actor,
    p_event_slug: slug,
    p_tier_id: v.id ?? null,
    p_name: v.name,
    p_description: v.description,
    p_price_cents: v.price_cents,
    p_quantity_total: v.quantity_total,
    p_max_per_order: v.max_per_order,
    p_sales_start: v.sales_start,
    p_sales_end: v.sales_end,
    p_is_active: v.is_active,
    p_sort_order: v.sort_order,
  });
  if (error) return { ok: false, error: mapDbError(error) };
  return { ok: true, data: data as string };
}

export async function adminRemoveTier(actor: string, tierId: string): Promise<Result<'deleted' | 'archived'>> {
  const { data, error } = await createSupabaseAdminClient().rpc('admin_remove_tier', {
    p_actor: actor,
    p_tier_id: tierId,
  });
  if (error) return { ok: false, error: mapDbError(error) };
  return { ok: true, data: data as 'deleted' | 'archived' };
}

export async function adminSetSetting(actor: string, s: SettingInput): Promise<Result<null>> {
  const { error } = await createSupabaseAdminClient().rpc('admin_set_setting', {
    p_actor: actor,
    p_key: s.key,
    p_value: s.value,
  });
  if (error) return { ok: false, error: mapDbError(error) };
  return { ok: true, data: null };
}

export interface AdminTier {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  quantity_total: number;
  max_per_order: number;
  sales_start: string | null;
  sales_end: string | null;
  is_active: boolean;
  archived_at: string | null;
  sort_order: number;
  sold: number;
  reserved: number;
}

export interface AdminEventView {
  event: {
    id: string;
    event_slug: string;
    starts_at: string;
    ends_at: string | null;
    doors_open_at: string | null;
    venue_name: string;
    venue_address: string;
    capacity: number;
    sales_open_at: string | null;
    sales_close_at: string | null;
    ticketing_enabled: boolean;
    status: string;
    consumed: number;
  } | null;
  tiers: AdminTier[];
}

/** Vue admin complète : événement + tous les tarifs (archivés inclus) + vendus / réservés. */
export async function adminGetEvent(slug: string): Promise<AdminEventView> {
  const db = createSupabaseAdminClient();
  const { data: ev } = await db.from('ticketed_events').select('*').eq('event_slug', slug).maybeSingle();
  if (!ev) return { event: null, tiers: [] };

  const [{ data: tiers }, { data: consumedEvent }] = await Promise.all([
    db.from('ticket_tiers').select('*').eq('ticketed_event_id', ev.id).order('archived_at', { nullsFirst: true }).order('sort_order').order('created_at'),
    db.rpc('event_consumed', { p_event: ev.id }),
  ]);

  const out: AdminTier[] = [];
  for (const t of tiers ?? []) {
    const [{ count }, { data: consumed }] = await Promise.all([
      db.from('tickets').select('id', { count: 'exact', head: true }).eq('tier_id', t.id).in('status', ['valid', 'used']),
      db.rpc('tier_consumed', { p_tier: t.id }),
    ]);
    const sold = count ?? 0;
    out.push({ ...t, sold, reserved: Math.max(0, (consumed as number) - sold) });
  }
  return { event: { ...ev, consumed: (consumedEvent as number) ?? 0 }, tiers: out };
}
