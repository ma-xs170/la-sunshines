import { z } from 'zod';
import { NextResponse } from 'next/server';
import { adminRpc, requireAdminApi } from '@/lib/adminSpace';
import { notifyPublicationReviewed } from '@/lib/organizer/publication-mail';
import { revalidatePublicSite } from '@/lib/revalidate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { approve, reason? } — valide ou refuse une demande de publication (admin actif). Refus : motif obligatoire (5 caractères). L'évènement approuvé devient public (page /editions/<slug>).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireAdminApi(); if (!a.ok) return a.res;
  const { id } = await params;
  const body = z.object({ approve: z.boolean(), reason: z.string().max(500).optional() }).safeParse(await req.json().catch(() => null));
  if (!/^[0-9a-f-]{36}$/i.test(id) || !body.success) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  const r = await adminRpc<{ slug: string; title: string; organizer: string; approved: boolean; reason: string; requester_email: string | null }>('admin_review_publication', { p_actor: a.s.userId, p_id: id, p_approve: body.data.approve, p_reason: body.data.reason ?? '' });
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });
  revalidatePublicSite();
  await notifyPublicationReviewed(r.data);
  return NextResponse.json({ ok: true });
}
