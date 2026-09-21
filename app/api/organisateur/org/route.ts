import { NextResponse } from 'next/server';
import { requireOrganizerApi } from '@/lib/organizer/access';
import { orgRpc, type OrgAccountRow } from '@/lib/organizer/data';
import { ORG_COOKIE } from '@/lib/organizer/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/organisateur/org (formulaire : id, next) — change l'organisation courante. L'id est revalidé parmi les organisations
// de l'utilisateur ; `next` doit rester dans /organisateur (pas de redirection ouverte).
export async function POST(req: Request) {
  const g = await requireOrganizerApi();
  if (!g.ok) return g.res;
  const form = await req.formData().catch(() => null);
  const id = String(form?.get('id') ?? '');
  const next = String(form?.get('next') ?? '');
  const orgs = await orgRpc<OrgAccountRow[]>('org_list', { p_actor: g.s.userId });
  const to = next.startsWith('/organisateur') && !next.startsWith('//') && !next.includes('\\') ? (next.startsWith('/organisateur/evenements/') ? '/organisateur' : next) : '/organisateur';
  const res = NextResponse.redirect(new URL(to, req.url), 303);
  if (orgs.ok && orgs.data.some((o) => o.id === id)) {
    res.cookies.set(ORG_COOKIE, id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365, secure: process.env.NODE_ENV === 'production' });
  }
  return res;
}
