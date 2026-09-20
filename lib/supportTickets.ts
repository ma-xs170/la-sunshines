// Demandes de support de l'assistant — stockées dans Supabase (table PRIVÉE support_tickets), jamais dans
// data/content.json (fichier versionné dans un dépôt public). SERVEUR UNIQUEMENT.
//
// Durée de conservation : 12 mois. La purge est faite par pg_cron (quotidien) quand l'extension est
// disponible, et en plus par l'application (à chaque nouvelle demande et à chaque ouverture du panneau).

import 'server-only';
import { createSupabaseAdminClient, supabaseAdminConfigured } from './supabase/admin';
import type { StoredTicket } from './store';

export const SUPPORT_RETENTION_DAYS = 365;

export function supportStorageConfigured(): boolean {
  return supabaseAdminConfigured();
}

type Row = { id: string; name: string; email: string; phone: string; subject: string; message: string; status: string; created_at: string };
const toTicket = (r: Row): StoredTicket => ({
  id: r.id, name: r.name, email: r.email, phone: r.phone, subject: r.subject, message: r.message,
  status: r.status === 'done' ? 'done' : 'open', createdAt: r.created_at,
});

/** Supprime les demandes de plus de 12 mois. Ne lève jamais : la purge est un « au mieux ». */
export async function purgeOldSupportTickets(): Promise<number> {
  if (!supportStorageConfigured()) return 0;
  try {
    const { data, error } = await createSupabaseAdminClient().rpc('purge_support_tickets', { p_days: SUPPORT_RETENTION_DAYS });
    if (error) throw error;
    return typeof data === 'number' ? data : 0;
  } catch (e) {
    console.error('[support] purge impossible :', e instanceof Error ? e.message : e);
    return 0;
  }
}

/** Enregistre une demande. Renvoie false si le stockage est indisponible (l'email reste alors le seul canal). */
export async function createSupportTicket(t: Pick<StoredTicket, 'name' | 'email' | 'phone' | 'subject' | 'message'>): Promise<StoredTicket | null> {
  if (!supportStorageConfigured()) return null;
  try {
    const { data, error } = await createSupabaseAdminClient().from('support_tickets').insert(t).select().single();
    if (error || !data) throw error ?? new Error('insertion vide');
    await purgeOldSupportTickets();
    return toTicket(data as Row);
  } catch (e) {
    console.error('[support] demande non enregistrée :', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function listSupportTickets(): Promise<StoredTicket[]> {
  if (!supportStorageConfigured()) return [];
  await purgeOldSupportTickets();
  try {
    const { data, error } = await createSupabaseAdminClient().from('support_tickets').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    return ((data ?? []) as Row[]).map(toTicket);
  } catch (e) {
    console.error('[support] lecture impossible :', e instanceof Error ? e.message : e);
    return [];
  }
}

export async function setSupportTicketStatus(id: string, status: 'open' | 'done'): Promise<StoredTicket | null> {
  if (!supportStorageConfigured()) return null;
  const { data, error } = await createSupabaseAdminClient().from('support_tickets').update({ status }).eq('id', id).select().maybeSingle();
  if (error || !data) return null;
  return toTicket(data as Row);
}

export async function deleteSupportTicket(id: string): Promise<boolean> {
  if (!supportStorageConfigured()) return false;
  const { data, error } = await createSupabaseAdminClient().from('support_tickets').delete().eq('id', id).select('id');
  return !error && (data?.length ?? 0) > 0;
}
