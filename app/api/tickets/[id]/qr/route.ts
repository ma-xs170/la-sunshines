import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/config';
import { qrPng } from '@/lib/ticketing/qr';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/tickets/[id]/qr — QR PNG d'un billet. La lecture passe par la RLS : on ne peut
// obtenir QUE le QR de SES billets (celui d'un autre client → 404). Aucun QR pour un
// billet annulé ou remboursé.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!supabaseConfigured() || !z.uuid().safeParse(id).success) return new Response('Introuvable', { status: 404 });
  const supabase = await createSupabaseServerClient();
  const { data: t } = await supabase.from('tickets').select('code, status').eq('id', id).maybeSingle();
  if (!t || !['valid', 'used'].includes(t.status)) return new Response('Introuvable', { status: 404 });
  return new Response(new Uint8Array(await qrPng(t.code)), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' },
  });
}
