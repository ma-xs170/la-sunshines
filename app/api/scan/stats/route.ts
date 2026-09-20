import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireScanner } from '@/lib/organizer/scan-access';
import { fail } from '@/lib/auth/http';
import { createSupabaseAdminClient, supabaseAdminConfigured } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?event_id= — compteur en direct « entrés / vendus » (staff, admin ou membre de l'organisation).
export async function GET(req: Request) {
  if (!supabaseAdminConfigured()) return fail('Indisponible.', 503);
  const id = new URL(req.url).searchParams.get('event_id') ?? '';
  const guard = await requireScanner(z.uuid().safeParse(id).success ? id : undefined);
  if (!guard.ok) return guard.res;
  if (!z.uuid().safeParse(id).success) return fail('Événement invalide.');
  const { data, error } = await createSupabaseAdminClient().rpc('scan_stats', { p_event: id });
  if (error) return fail('Indisponible.', 500);
  const r = (Array.isArray(data) ? data[0] : data) as { entered: number; sold: number };
  return NextResponse.json({ entered: r.entered, sold: r.sold });
}
