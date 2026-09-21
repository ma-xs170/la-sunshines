// Évènements rattachés à une organisation par la table de liaison `event_links` (migration 022) : éditions statiques, éditions de data/content.json, évènement de test.
// Lecture seule, côté serveur. Le contenu éditorial reste dans le code / content.json : rien n'est copié ni modifié ici.
// Si la table n'existe pas encore (migration non appliquée) ou si Supabase n'est pas configuré, la liste est simplement vide.
import 'server-only';
import { getAllEditions } from '@/lib/content';
import { createSupabaseAdminClient, supabaseAdminConfigured } from '@/lib/supabase/admin';

export interface LinkedEdition {
  slug: string; name: string; dateISO: string | null; dateLabel: string; venue: string; flyer: string | null;
  hidden: boolean; archived: boolean; isTest: boolean; past: boolean; artists: string[];
}

const splitNames = (s: string | undefined) => (s ?? '').split(/\s*[·,]\s*/).map((n) => n.trim()).filter(Boolean);

async function linkRows(filter: { organizerId?: string; slug?: string }): Promise<{ event_slug: string; organizer_id: string; is_test: boolean }[]> {
  if (!supabaseAdminConfigured()) return [];
  try {
    let q = createSupabaseAdminClient().from('event_links').select('event_slug, organizer_id, is_test');
    if (filter.organizerId) q = q.eq('organizer_id', filter.organizerId);
    if (filter.slug) q = q.eq('event_slug', filter.slug);
    const { data, error } = await q;
    return error ? [] : ((data ?? []) as { event_slug: string; organizer_id: string; is_test: boolean }[]);
  } catch { return []; }
}

/** Éditions rattachées à `orgId`, brouillons et archives compris (espace organisateur / admin). */
export async function linkedEditionsOf(orgId?: string, now = Date.now()): Promise<LinkedEdition[]> {
  const rows = await linkRows({ organizerId: orgId });
  if (!rows.length) return [];
  const test = new Map(rows.map((r) => [r.event_slug, r.is_test]));
  return getAllEditions({ includeHidden: true }).filter((e) => test.has(e.slug)).map((e) => {
    const end = e.dateISO ? Date.parse(`${e.dateISO}T23:59:59-04:00`) + 86_400_000 / 2 : NaN;
    return {
      slug: e.slug, name: e.name, dateISO: e.dateISO ?? null, dateLabel: e.dateFull, venue: e.venue ?? '', flyer: e.flyer ?? null,
      hidden: e.hidden === true, archived: e.archived === true, isTest: test.get(e.slug) === true, past: Number.isFinite(end) && end < now,
      artists: [...new Set([...splitNames(e.headliner), ...(e.lineup ?? [])])],
    };
  });
}

/** Éditions à montrer publiquement : ni brouillon, ni archive, ni test. */
export async function publicLinkedEditionsOf(orgId: string, now = Date.now()): Promise<LinkedEdition[]> {
  return (await linkedEditionsOf(orgId, now)).filter((e) => !e.hidden && !e.archived && !e.isTest);
}

/** Organisation propriétaire d'un slug rattaché (bloc « Organisé par » des pages évènement). */
export async function linkedOrganizerIdOf(slug: string): Promise<string | null> {
  const [r] = await linkRows({ slug });
  return r && !r.is_test ? r.organizer_id : null;
}
