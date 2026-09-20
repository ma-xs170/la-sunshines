import { NextResponse } from 'next/server';
import { requireScanner } from '@/lib/organizer/scan-access';
import { getSession } from '@/lib/auth/roles';
import { fail, parseBody, TOO_MANY } from '@/lib/auth/http';
import { rateLimit } from '@/lib/rateLimit';
import { createSupabaseAdminClient, supabaseAdminConfigured } from '@/lib/supabase/admin';
import { scanSchema } from '@/lib/ticketing/schemas';
import { verifyTicketCode } from '@/lib/ticketing/tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { code, event_id } — scan à l'entrée. Réservé au STAFF / ADMINS Supabase et aux membres de l'organisation de l'événement.
// 1) la signature HMAC est vérifiée AVANT la base (un code falsifié ne la touche jamais) ;
// 2) le marquage « utilisé » est atomique (scan_ticket) : un billet ne passe qu'une fois,
//    même scanné par deux portes en même temps.
export async function POST(req: Request) {
  if (!supabaseAdminConfigured()) return fail('Indisponible.', 503);
  const who = await getSession();
  if (!who) return fail('Connexion requise.', 401);
  const rl = await rateLimit(`scan:${who.userId}`, 300, 60);
  if (!rl.ok) return fail(TOO_MANY, 429);

  const parsed = await parseBody(req, scanSchema);
  if ('res' in parsed) return parsed.res;
  const guard = await requireScanner(parsed.data.event_id, who);   // staff / admin du site, ou membre de l'organisation de l'événement
  if (!guard.ok) return guard.res;

  const code = verifyTicketCode(parsed.data.code);
  if (!code) return NextResponse.json({ result: 'invalid' });

  const { data, error } = await createSupabaseAdminClient().rpc('scan_ticket', {
    p_code: code, p_event: parsed.data.event_id, p_scanner: guard.session.userId,
  });
  if (error) {
    console.error('[scan]', error);
    return fail('Scan impossible. Réessaie.', 500);
  }
  const r = (Array.isArray(data) ? data[0] : data) as { result: string; holder: string | null; tier_name: string | null; used_at: string | null };
  return NextResponse.json({ result: r.result, holder: r.holder, tier: r.tier_name, used_at: r.used_at });
}
