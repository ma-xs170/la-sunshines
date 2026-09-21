import { NextResponse } from 'next/server';
import { requireOrganizerApi } from '@/lib/organizer/access';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?ref=ORG.XXXXXXXX — réservé aux ADMINS : retrouve une organisation par sa référence pour créer un évènement à sa place. Les autres reçoivent 403.
export async function GET(req: Request) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  if (!g.s.isAdmin) return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  const ref = (new URL(req.url).searchParams.get('ref') ?? '').trim().toUpperCase();
  if (!/^ORG\.[0-9]{8}$/.test(ref)) return NextResponse.json({ error: 'Référence invalide : ORG. suivi de 8 chiffres.' }, { status: 400 });
  const { data } = await createSupabaseAdminClient().from('organizers').select('id, name, reference, siret, account_status').eq('reference', ref).maybeSingle();
  if (!data) return NextResponse.json({ error: 'Aucune organisation avec cette référence.' }, { status: 404 });
  const { count } = await createSupabaseAdminClient().from('ticketed_events').select('id', { count: 'exact', head: true }).eq('organizer_id', data.id);
  return NextResponse.json({ id: data.id, name: data.name, reference: data.reference, siret: data.siret, status: data.account_status, events: count ?? 0 });
}
