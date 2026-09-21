import { z } from 'zod';
import { requireOrganizerApi } from '@/lib/organizer/access';
import { mapOrgError, orgRpc } from '@/lib/organizer/data';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { SLUG_RE } from '@/lib/ticketing/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const iso = z.string().refine((v) => v === '' || !Number.isNaN(Date.parse(v)), 'Date invalide.').nullable().optional();
const create = z.object({
  id: z.undefined().optional(), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,24}$/, 'Le code : 3 à 24 caractères (lettres, chiffres, - et _).'),
  title: z.string().trim().max(80).default(''), kind: z.enum(['fixed', 'percent']), value: z.number().int().min(1),
  max_uses: z.number().int().min(1).max(100000).nullable().optional(), starts_at: iso, ends_at: iso, tier_ids: z.array(z.string().uuid()).max(50).optional(),
  active: z.boolean().optional(),
}).refine((v) => v.kind !== 'percent' || v.value <= 100, { message: 'Un pourcentage ne peut pas dépasser 100.', path: ['value'] })
  .refine((v) => !v.starts_at || !v.ends_at || Date.parse(v.ends_at) > Date.parse(v.starts_at), { message: 'La fin doit être après le début.', path: ['ends_at'] });
const update = z.object({ id: z.string().uuid(), title: z.string().trim().max(80).optional(), active: z.boolean().optional(), max_uses: z.number().int().min(1).max(100000).nullable().optional(), starts_at: iso, ends_at: iso });

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireOrganizerApi(); if (!g.ok) return g.res;
  const { slug } = await params; if (!SLUG_RE.test(slug)) return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  const r = await orgRpc('org_promos', { p_actor: g.s.userId, p_slug: slug });
  return r.ok ? Response.json(r.data, { headers: { 'Cache-Control': 'no-store' } }) : Response.json({ error: r.error.message }, { status: r.error.status });
}

// PUT : crée (sans id) ou modifie (avec id : titre, activation, quantité, dates ; le code, le type et la valeur sont figés). Rôle revérifié en SQL.
export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireOrganizerApi(); if (!g.ok) return g.res;
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  const isUpdate = body && typeof body === 'object' && 'id' in body && (body as { id?: unknown }).id;
  const p = (isUpdate ? update : create).safeParse(body);
  if (!SLUG_RE.test(slug) || !p.success) return Response.json({ error: p.success ? 'Requête invalide.' : p.error.issues[0]?.message ?? 'Requête invalide.' }, { status: 400 });
  const { id, ...data } = p.data as { id?: string } & Record<string, unknown>;
  const { data: out, error } = await createSupabaseAdminClient().rpc('org_promo_save', { p_actor: g.s.userId, p_slug: slug, p_id: id ?? null, p_data: data });
  if (error) {
    if (error.message.includes('promo_codes_ticketed_event_id_code_key')) return Response.json({ error: 'Ce code existe déjà pour cet évènement.' }, { status: 409 });
    const f = mapOrgError(error); return Response.json({ error: error.message === 'PROMO_NOT_FOUND' ? 'Code introuvable.' : error.message === 'TIER_UNAVAILABLE' ? 'Tarif invalide.' : f.message }, { status: error.message === 'PROMO_NOT_FOUND' ? 404 : f.status });
  }
  return Response.json({ ok: true, id: out });
}
