import { NextResponse } from 'next/server';
import { createSupabasePublicClient } from '@/lib/supabase/public';
import { SLUG_RE } from '@/lib/ticketing/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Disponibilité publique par tarif (compteurs uniquement, aucune donnée de commande).
// Le stock affiché est indicatif ; la réservation atomique reste seule juge.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return NextResponse.json({ error: 'Événement introuvable.' }, { status: 404 });

  const supabase = createSupabasePublicClient(true);
  if (!supabase) return NextResponse.json({ tiers: [] });

  const { data, error } = await supabase.rpc('get_availability', { p_slug: slug });
  if (error) return NextResponse.json({ error: 'Indisponible.' }, { status: 503 });

  return NextResponse.json(
    { tiers: (data ?? []).map((r: { tier_id: string; remaining: number; state: string }) => ({ id: r.tier_id, remaining: r.remaining, state: r.state })) },
    { headers: { 'Cache-Control': 'public, s-maxage=3, stale-while-revalidate=10' } },
  );
}
