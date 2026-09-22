import { z } from 'zod';
import { adminRpc } from '@/lib/adminSpace';
import { json, requireClientsApi } from '@/lib/admin/clients/access';
import { validateEditForm, type ClientDetail, type EditForm } from '@/lib/admin/clients/detail';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { mailConfigured, sendMail } from '@/lib/mail';
import { originOf } from '@/lib/auth/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idSchema = z.uuid();
const editSchema = z.object({ first_name: z.string(), last_name: z.string(), phone: z.string(), phone2: z.string(), email: z.string(), birth_date: z.string(), reason: z.string(), expected_updated_at: z.string() });

// GET : fiche complète (journalise une consultation, dédupliquée 1×/10 min). PATCH : enregistre après confirmation avant/après (voir /check pour l'aperçu sans écriture).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireClientsApi(); if (!g.ok) return g.res;
  const { id } = await params; if (!idSchema.safeParse(id).success) return json({ error: 'Compte introuvable.' }, 404);
  const silent = new URL(req.url).searchParams.get('silent') === '1';
  const r = await adminRpc<ClientDetail>('admin_customer_detail', { p_actor: g.a.userId, p_id: id, p_log: !silent });
  return r.ok ? json(r.data) : json({ error: r.message }, r.status);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireClientsApi('modifier'); if (!g.ok) return g.res;
  const { id } = await params; if (!idSchema.safeParse(id).success) return json({ error: 'Compte introuvable.' }, 404);
  const body = editSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: 'Requête invalide.' }, 400);
  const f: EditForm = body.data;
  // Revalidation côté serveur (le formulaire l'a déjà fait côté client, mais on ne fait jamais confiance au navigateur seul).
  const cur = await adminRpc<ClientDetail>('admin_customer_detail', { p_actor: g.a.userId, p_id: id, p_log: false });
  if (!cur.ok) return json({ error: cur.message }, cur.status);
  const v = validateEditForm(f, { email: cur.data.profile.email, birth_date: cur.data.profile.birth_date });
  if (!v.ok) return json({ error: Object.values(v.errors)[0] ?? 'Requête invalide.' }, 400);

  const r = await adminRpc<{ before: Record<string, unknown>; after: Record<string, unknown>; email_changed: boolean; old_email: string; updated_at: string }>('admin_customer_update', {
    p_actor: g.a.userId, p_id: id, p_first: v.value.first_name, p_last: v.value.last_name, p_phone: v.value.phone, p_phone2: v.value.phone2, p_email: v.value.email, p_birth: v.value.birth_date,
    p_reason: v.value.reason, p_expected: body.data.expected_updated_at,
  });
  if (!r.ok) return json({ error: r.message }, r.status);

  const warnings: string[] = [];
  if (r.data.email_changed) {
    // L'écriture en base a déjà eu lieu (et l'audit avant/après avec elle) : on synchronise maintenant l'identifiant de connexion Supabase Auth.
    const db = createSupabaseAdminClient();
    const upd = await db.auth.admin.updateUserById(id, { email: v.value.email });
    if (upd.error) {
      warnings.push('L’adresse a été mise à jour dans la fiche, mais pas comme identifiant de connexion : réessaie ou préviens le client par l’ancienne adresse.');
      await adminRpc('admin_customer_log', { p_actor: g.a.userId, p_id: id, p_action: 'customer.email_sync_failed', p_meta: { error: upd.error.message } });
    } else {
      const oldEmail = r.data.old_email;
      let sent = false;
      if (oldEmail && mailConfigured()) {
        sent = await sendMail({
          to: oldEmail, subject: 'Adresse e-mail modifiée sur ton compte LA SUNSHINES',
          html: `<p>Bonjour,</p><p>L’adresse e-mail de ton compte LA SUNSHINES vient d’être changée par un administrateur, à la demande du support ou pour corriger une erreur de saisie.</p>` +
            `<p>Si tu n’es pas à l’origine de cette demande, contacte-nous immédiatement via <a href="${originOf(req)}/contact">${originOf(req)}/contact</a>.</p>`,
        });
      }
      await adminRpc('admin_customer_log', { p_actor: g.a.userId, p_id: id, p_action: 'customer.email_notice', p_meta: { sent } });
      if (!sent) warnings.push('L’ancienne adresse n’a pas pu être prévenue par e-mail (notification non envoyée, journalisée).');
    }
  }
  return json({ ok: true, updated_at: r.data.updated_at, warnings });
}
