import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/roles';
import { createSupabaseAdminClient, supabaseAdminConfigured } from '@/lib/supabase/admin';
import { supabaseConfigured } from '@/lib/supabase/config';
import { submitSchema } from '@/lib/organizer/signup';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ERR: Record<string, [number, string]> = {
  TOO_MANY_PENDING: [409, 'Tu as déjà 3 dossiers en attente. Attends leur validation avant d’en déposer un autre.'], IDENTITY_REQUIRED: [400, 'La pièce d’identité est obligatoire.'],
  BAD_SIRET: [400, 'SIRET invalide.'], BAD_EMAIL: [400, 'Adresse e-mail invalide.'], BAD_LEGAL_FORM: [400, 'Forme juridique invalide.'], NAME_REQUIRED: [400, 'Le nom de la structure est obligatoire.'], FORBIDDEN: [403, 'Accès refusé.'],
};

// POST { data, docs } — crée l'organisation EN ATTENTE d'approbation (l'auteur en devient le propriétaire). Aucun évènement n'est possible avant l'approbation par un admin.
export async function POST(req: Request) {
  if (!supabaseConfigured() || !supabaseAdminConfigured()) return NextResponse.json({ error: 'Inscription indisponible.' }, { status: 503 });
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
  if (!(await rateLimit(`org-signup:${s.userId}:${clientIp(req)}`, 5, 3600)).ok) return NextResponse.json({ error: 'Trop de tentatives. Réessaie plus tard.' }, { status: 429 });
  const parsed = submitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.', field: String(parsed.error.issues[0]?.path?.[1] ?? parsed.error.issues[0]?.path?.[0] ?? '') }, { status: 400 });
  const { data, error } = await createSupabaseAdminClient().rpc('org_register', { p_actor: s.userId, p_data: parsed.data.data, p_docs: parsed.data.docs });
  if (error) { const e = ERR[error.message]; if (!e) console.error('[org_register]', error.message); return NextResponse.json({ error: e?.[1] ?? 'Erreur inattendue. Réessaie.' }, { status: e?.[0] ?? 500 }); }
  return NextResponse.json(data);
}
