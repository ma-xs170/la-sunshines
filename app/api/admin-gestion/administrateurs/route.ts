import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminError, adminRpc, requireAdminApi } from '@/lib/adminSpace';
import { generatePassword } from '@/lib/adminPassword';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { mailButton, mailConfigured, mailLayout, mailScript, sendMail } from '@/lib/mail';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const create = z.object({ email: z.string().trim().toLowerCase().pipe(z.email('Adresse e-mail invalide.')), first_name: z.string().trim().min(1, 'Prénom requis.').max(60), last_name: z.string().trim().min(1, 'Nom requis.').max(60),
  phone: z.string().trim().max(30).regex(/^[+0-9 ().-]*$/, 'Numéro de téléphone invalide.'), level: z.enum(['super', 'admin']) });
const action = z.object({ user_id: z.string().uuid(), action: z.enum(['disable', 'enable', 'reset', 'resend']) });
const permissions = z.object({ user_id: z.string().uuid(), action: z.literal('permissions'), permissions: z.array(z.enum(['clients.lire', 'clients.modifier'])) });

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Envoie l'invitation (identifiant + mot de passe provisoire + lien de connexion). Le mot de passe ne sort de cette fonction QUE dans le corps
 *  du mail : jamais loggé, jamais renvoyé au navigateur, jamais écrit en base. Best-effort : un échec n'annule jamais la création du compte. */
async function invite(origin: string, email: string, first: string, password: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!mailConfigured()) return { ok: false, message: 'RESEND_API_KEY absente : aucun e-mail ne peut être envoyé.' };
  const link = `${origin}/connexion?next=${encodeURIComponent('/admin/gestion')}`;
  return sendMail({ to: email, subject: 'Ton accès administrateur LA SUNSHINES',
    html: mailLayout(
      `${mailScript('Accès administrateur')}<h2>Bienvenue dans l’équipe</h2>
       <p>Bonjour ${esc(first) || ''},</p>
       <p>Un compte administrateur LA SUNSHINES vient d’être créé pour toi.</p>
       <table role="presentation" style="width:100%;margin:18px 0;border-collapse:collapse">
         <tr><td style="padding:6px 0;color:#8a8378;font-size:13px;width:140px">Identifiant</td><td style="padding:6px 0;font-weight:700">${esc(email)}</td></tr>
         <tr><td style="padding:6px 0;color:#8a8378;font-size:13px">Mot de passe provisoire</td><td style="padding:6px 0"><code style="background:#FFF3DE;padding:4px 10px;border-radius:8px;font-size:15px;font-weight:700;letter-spacing:.02em">${esc(password)}</code></td></tr>
       </table>
       <p style="margin:24px 0">${mailButton(link, 'Me connecter')}</p>
       <p style="font-size:13px;color:#8a8378">Tu devras choisir ton propre mot de passe dès la première connexion. Supprime ensuite ce message : le mot de passe ci-dessus ne sera plus valable une fois changé.</p>`,
    ) });
}

// GET : liste. POST : création (super-admin). PATCH : désactiver / réactiver / réinitialiser / renvoyer l'invitation (nouveau mot de passe).
export async function GET() {
  const g = await requireAdminApi(); if (!g.ok) return g.res;
  const r = await adminRpc('admin_accounts_list', { p_actor: g.s.userId });
  return r.ok ? NextResponse.json(r.data, { headers: { 'Cache-Control': 'no-store' } }) : NextResponse.json({ error: r.message }, { status: r.status });
}

export async function POST(req: Request) {
  const g = await requireAdminApi(); if (!g.ok) return g.res;
  if (!(await rateLimit(`adm-create:${g.s.userId}`, 10, 3600)).ok) return NextResponse.json({ error: 'Trop de créations. Réessaie plus tard.' }, { status: 429 });
  const p = create.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? 'Requête invalide.' }, { status: 400 });
  const v = p.data;
  // 1) contrôle du droit AVANT de créer un compte Auth
  const pre = await adminRpc('admin_accounts_list', { p_actor: g.s.userId });
  if (!pre.ok) return NextResponse.json({ error: pre.message }, { status: pre.status });
  const db = createSupabaseAdminClient();
  const password = generatePassword();
  const { data: created, error } = await db.auth.admin.createUser({ email: v.email, password, email_confirm: true, user_metadata: { first_name: v.first_name, last_name: v.last_name } });
  if (error || !created.user) return NextResponse.json({ error: /already|registered|exists/i.test(error?.message ?? '') ? 'Un compte existe déjà avec cette adresse e-mail.' : 'Création impossible.' }, { status: 409 });
  const reg = await adminRpc<string>('admin_account_register', { p_actor: g.s.userId, p_user: created.user.id, p_level: v.level, p_first: v.first_name, p_last: v.last_name, p_phone: v.phone });
  if (!reg.ok) { await db.auth.admin.deleteUser(created.user.id); return NextResponse.json({ error: reg.message }, { status: reg.status }); }   // compte Auth tout juste créé par cette requête : retiré si l'enregistrement échoue
  const sent = await invite(new URL(req.url).origin, v.email, v.first_name, password);
  await db.rpc('admin_mark_invitation', { p_user: created.user.id, p_status: sent.ok ? 'sent' : 'failed', p_error: sent.ok ? '' : sent.message });
  return NextResponse.json({ ok: true, reference: reg.data, invitation: sent.ok ? 'sent' : 'failed' });   // le mot de passe n'est JAMAIS renvoyé
}

export async function PATCH(req: Request) {
  const g = await requireAdminApi(); if (!g.ok) return g.res;
  const body = await req.json().catch(() => null);
  if (body?.action === 'permissions') {
    const pp = permissions.safeParse(body);
    if (!pp.success) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    const r = await adminRpc('admin_account_set_permissions', { p_actor: g.s.userId, p_user: pp.data.user_id, p_permissions: pp.data.permissions });
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.message }, { status: r.status });
  }
  const p = action.safeParse(body);
  if (!p.success) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  const { user_id, action: act } = p.data;
  if (act === 'disable' || act === 'enable') {
    const r = await adminRpc('admin_account_set', { p_actor: g.s.userId, p_user: user_id, p_active: act === 'enable' });
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.message }, { status: r.status });
  }
  const r = await adminRpc('admin_account_reset', { p_actor: g.s.userId, p_user: user_id });
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });
  const db = createSupabaseAdminClient();
  const { data: u } = await db.auth.admin.getUserById(user_id);
  const email = u.user?.email; if (!email) return NextResponse.json({ error: adminError('USER_NOT_FOUND').message }, { status: 404 });
  const password = generatePassword();
  const upd = await db.auth.admin.updateUserById(user_id, { password });
  if (upd.error) return NextResponse.json({ error: 'Réinitialisation impossible.' }, { status: 500 });
  const first = String(u.user?.user_metadata?.first_name ?? '');
  const sent = await invite(new URL(req.url).origin, email, first, password);
  await db.rpc('admin_mark_invitation', { p_user: user_id, p_status: sent.ok ? 'sent' : 'failed', p_error: sent.ok ? '' : sent.message });
  return NextResponse.json({ ok: true, invitation: sent.ok ? 'sent' : 'failed' });
}
