import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminRpc, requireAdminApi } from '@/lib/adminSpace';
import { revalidatePublicSite } from '@/lib/revalidate';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { mailButton, mailConfigured, mailLayout, mailScript, sendMail, siteUrl } from '@/lib/mail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const contact = z.object({ action: z.literal('contact'), name: z.string().trim().min(1, 'Le nom de la structure est obligatoire.').max(120), legal_form: z.string().trim().max(120), siret: z.string().trim().regex(/^([0-9]{14})?$/, 'Le SIRET doit comporter 14 chiffres.'),
  responsible: z.string().trim().max(120), address: z.string().trim().max(250), email: z.string().trim().max(254).refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Adresse e-mail invalide.') });
const status = z.object({ action: z.enum(['approve', 'suspend', 'reactivate']) });

/** Prévient le ou les propriétaires d'une organisation d'un changement de statut. Best-effort : attendu avant de répondre
 *  (réponse fiable, testable), mais un échec d'envoi n'annule JAMAIS le changement de statut déjà écrit en base. */
async function notifyStatus(orgId: string, orgName: string, status: 'approved' | 'suspended') {
  if (!mailConfigured()) return;
  try {
    const db = createSupabaseAdminClient();
    const { data: owners } = await db.from('organizer_members').select('user_id').eq('organizer_id', orgId).eq('role', 'owner');
    for (const o of owners ?? []) {
      const { data: u } = await db.auth.admin.getUserById(o.user_id);
      if (!u.user?.email) continue;
      const html = status === 'approved'
        ? mailLayout(`${mailScript('Organisation approuvée')}<h2>${orgName}</h2>
            <p>Bonne nouvelle : votre organisation a été approuvée par l’équipe LA SUNSHINES.</p>
            <p>Vous pouvez désormais créer et publier vos évènements.</p>
            <p style="margin:24px 0">${mailButton(`${siteUrl()}/organisateur`, 'Ouvrir mon espace organisateur')}</p>`)
        : mailLayout(`${mailScript('Organisation suspendue')}<h2>${orgName}</h2>
            <p>Votre organisation a été suspendue par l’équipe LA SUNSHINES : les ventes et publications sont bloquées jusqu’à nouvel ordre.</p>
            <p style="font-size:13px;color:#8a8378">Pour toute question, contactez-nous via la page Contact du site.</p>`);
      await sendMail({ to: u.user.email, subject: status === 'approved' ? 'Ton organisation est approuvée — LA SUNSHINES' : 'Ton organisation est suspendue — LA SUNSHINES', html });
    }
  } catch (e) {
    console.error('[organisateurs] notifyStatus a échoué :', e instanceof Error ? e.message : e);
  }
}

// POST — approuver / suspendre / réactiver, ou modifier le contact. Admin actif uniquement ; journalisé en SQL. Approbation et suspension
// envoient un e-mail (best-effort) à chaque propriétaire de l'organisation. Il n'existe pas de « refus » distinct : une organisation en
// attente n'est encore approuvée nulle part (aucun accès), il n'y a donc rien à lui retirer ; la contacter se fait via le Support.
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
  const target = s.data.action === 'suspend' ? 'suspended' : 'approved';
  const r = await adminRpc<{ reference: string; account_status: string; name?: string }>('admin_set_organizer_status', { p_actor: g.s.userId, p_org: id, p_status: target });
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });
  revalidatePublicSite();
  if (s.data.action !== 'reactivate' && (target === 'approved' || target === 'suspended')) {
    const { data: org } = await createSupabaseAdminClient().from('organizers').select('name').eq('id', id).single();
    if (org?.name) await notifyStatus(id, org.name, target);
  }
  return NextResponse.json({ ok: true, ...r.data });
}
