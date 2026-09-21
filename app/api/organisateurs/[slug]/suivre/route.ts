import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/roles';
import { createSupabaseAdminClient, supabaseAdminConfigured } from '@/lib/supabase/admin';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

// GET : état du suivi. POST { notify } : suivre (notification = opt-in explicite). DELETE : ne plus suivre. Compte client requis ; l'utilisateur vient de la SESSION.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const s = await getSession();
  if (!SLUG.test(slug) || !supabaseAdminConfigured()) return NextResponse.json({ following: false, notify: false, auth: false });
  if (!s) return NextResponse.json({ following: false, notify: false, auth: false });
  const { data } = await createSupabaseAdminClient().rpc('follow_state', { p_user: s.userId, p_slug: slug });
  return NextResponse.json({ ...(data as object), auth: true }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Connecte-toi pour suivre cet organisateur.' }, { status: 401 });
  if (!(await rateLimit(`follow:${s.userId}:${clientIp(req)}`, 60, 3600)).ok) return NextResponse.json({ error: 'Trop de demandes.' }, { status: 429 });
  const p = z.object({ notify: z.boolean().default(false) }).safeParse(await req.json().catch(() => ({})));
  if (!SLUG.test(slug) || !p.success) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  const { data, error } = await createSupabaseAdminClient().rpc('follow_organizer', { p_user: s.userId, p_slug: slug, p_notify: p.data.notify });
  return error ? NextResponse.json({ error: 'Organisateur introuvable.' }, { status: 404 }) : NextResponse.json(data);
}
export async function DELETE(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
  if (!SLUG.test(slug)) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  await createSupabaseAdminClient().rpc('unfollow_organizer', { p_user: s.userId, p_slug: slug });
  return NextResponse.json({ ok: true });
}
