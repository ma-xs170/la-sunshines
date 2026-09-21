import { NextResponse } from 'next/server';
import { adminRpc, requireAdminApi } from '@/lib/adminSpace';
import { getAllEditions } from '@/lib/content';
import { fold } from '@/lib/dresscodeColors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?q= — recherche globale admin (organisations, admins, commandes, évènements). Admin actif uniquement (revérifié en SQL) ;
// les recherches par e-mail ou téléphone sont journalisées (type seulement, jamais le texte). Les noms d'évènements viennent du contenu éditorial.
export async function GET(req: Request) {
  const g = await requireAdminApi(); if (!g.ok) return g.res;
  const q = (new URL(req.url).searchParams.get('q') ?? '').slice(0, 80);
  const r = await adminRpc<{ organizers: unknown[]; admins: unknown[]; orders: unknown[]; events: { slug: string }[] }>('admin_global_search', { p_actor: g.s.userId, p_q: q });
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });
  const f = fold(q);
  const known = new Set(r.data.events.map((e) => e.slug));
  const byName = f.length >= 2 ? getAllEditions({ includeHidden: true }).filter((e) => fold(e.name).includes(f) && !known.has(e.slug)).slice(0, 5).map((e) => ({ slug: e.slug, name: e.name })) : [];
  return NextResponse.json({ ...r.data, editions: byName }, { headers: { 'Cache-Control': 'no-store' } });
}
