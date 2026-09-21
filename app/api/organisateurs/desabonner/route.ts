import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, supabaseAdminConfigured } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET/POST ?token= — désabonnement des e-mails en UN clic (lien reçu dans chaque message ; POST pour le « one-click » RFC 8058). Sans compte requis.
async function run(req: Request) {
  const t = new URL(req.url).searchParams.get('token') ?? '';
  if (UUID.test(t) && supabaseAdminConfigured()) await createSupabaseAdminClient().rpc('unsubscribe_by_token', { p_token: t });
  return new NextResponse('<!doctype html><meta charset="utf-8"><title>Désabonnement</title><body style="font-family:sans-serif;max-width:480px;margin:15vh auto;padding:0 20px"><h1>C’est fait</h1><p>Tu ne recevras plus d’e-mails de cet organisateur. Tu peux toujours le suivre depuis sa page.</p></body>', { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
export const GET = run;
export const POST = run;
