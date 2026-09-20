// Droit de scanner un événement : staff / admin du site (rôle du profil), ou membre — tout rôle — de l'organisation de l'événement.
// La base revérifie le même droit dans scan_ticket (jamais de confiance côté route seule).
import 'server-only';
import { NextResponse } from 'next/server';
import { getSession, hasRole, type Session } from '@/lib/auth/roles';
import { supabaseConfigured } from '@/lib/supabase/config';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

type Guard = { ok: true; session: Session } | { ok: false; res: NextResponse };

/** 401 sans connexion. Les rôles profil staff / admin passent ; sinon, il faut être membre de l'organisation de l'événement (403). */
export async function requireScanner(eventId?: string, known?: Session): Promise<Guard> {
  if (!supabaseConfigured()) return { ok: false, res: NextResponse.json({ error: 'Comptes indisponibles.' }, { status: 503 }) };
  const session = known ?? (await getSession());
  if (!session) return { ok: false, res: NextResponse.json({ error: 'Connexion requise.' }, { status: 401 }) };
  if (hasRole(session.profile.role, 'staff')) return { ok: true, session };
  if (eventId) {
    const { data } = await createSupabaseAdminClient().rpc('scan_access', { p_actor: session.userId, p_event: eventId });
    if (data === true) return { ok: true, session };
  }
  return { ok: false, res: NextResponse.json({ error: 'Accès refusé.' }, { status: 403 }) };
}
