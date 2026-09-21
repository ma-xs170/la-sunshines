import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminRpc, requireAdminApi } from '@/lib/adminSpace';
import { revalidatePublicSite } from '@/lib/revalidate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const contact = z.object({ action: z.literal('contact'), name: z.string().trim().min(1, 'Le nom de la structure est obligatoire.').max(120), legal_form: z.string().trim().max(120), siret: z.string().trim().regex(/^([0-9]{14})?$/, 'Le SIRET doit comporter 14 chiffres.'),
  responsible: z.string().trim().max(120), address: z.string().trim().max(250), email: z.string().trim().max(254).refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Adresse e-mail invalide.') });
const status = z.object({ action: z.enum(['approve', 'suspend', 'reactivate']) });

// POST — approuver / suspendre / réactiver, ou modifier le contact. Admin actif uniquement ; journalisé en SQL.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdminApi(); if (!g.ok) return g.res;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  const body = await req.json().catch(() => null);
  const c = contact.safeParse(body);
  if (c.success) {
    const v = c.data;
    const r = await adminRpc('admin_update_organizer_contact', { p_actor: g.s.userId, p_org: id, p_name: v.name, p_legal_form: v.legal_form, p_siret: v.siret, p_responsible: v.responsible, p_address: v.address, p_email: v.email });
    if (r.ok) revalidatePublicSite();
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.message }, { status: r.status });
  }
  const s = status.safeParse(body);
  if (!s.success) return NextResponse.json({ error: c.error.issues[0]?.message ?? 'Requête invalide.' }, { status: 400 });
  const r = await adminRpc<{ reference: string; account_status: string }>('admin_set_organizer_status', { p_actor: g.s.userId, p_org: id, p_status: s.data.action === 'suspend' ? 'suspended' : 'approved' });
  if (r.ok) revalidatePublicSite();
  return r.ok ? NextResponse.json({ ok: true, ...r.data }) : NextResponse.json({ error: r.message }, { status: r.status });
}
