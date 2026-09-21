import 'server-only';
import { mailButton, mailLayout, mailScript, sendMail, siteUrl } from '@/lib/mail';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { mailRecipients } from './publication';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const live = () => process.env.PUBLICATION_MAIL_LIVE === '1';

async function adminEmails(): Promise<string[]> {
  const db = createSupabaseAdminClient();
  const { data } = await db.from('admin_accounts').select('user_id').eq('active', true);
  const out: string[] = [];
  for (const a of data ?? []) { const { data: u } = await db.auth.admin.getUserById(a.user_id as string); if (u.user?.email) out.push(u.user.email); }
  return out;
}

async function deliver(real: string[], subject: string, html: string): Promise<void> {
  const r = mailRecipients(real, live());
  // en test, le message est marqué avec les destinataires réels qu'il aurait eus
  const body = r.redirected ? `<p style="font-size:12px;color:#A5670F">[TEST : destinataires prévus en production : ${esc(real.join(', ') || 'aucun')}]</p>${html}` : html;
  for (const to of r.to) await sendMail({ to, subject: (r.redirected ? '[TEST] ' : '') + subject, html: mailLayout(body) });
}

/** Nouvelle demande : prévient les admins. Ne fait jamais échouer l'action appelante. */
export async function notifyPublicationRequested(d: { slug: string; title: string; organizer: string }): Promise<void> {
  try {
    await deliver(await adminEmails(), `Publication à valider : ${d.title}`, `${mailScript('À valider')}<h2>${esc(d.title)}</h2><p>${esc(d.organizer)} demande la publication de cet évènement.</p>${mailButton(`${siteUrl()}/admin/gestion/publications`, 'Ouvrir la file d’attente')}`);
  } catch (e) { console.error('[publication] e-mail de demande :', e); }
}

/** Décision : prévient le demandeur (approuvée ou refusée avec motif). */
export async function notifyPublicationReviewed(d: { slug: string; title: string; organizer: string; approved: boolean; reason: string; requester_email: string | null }): Promise<void> {
  try {
    const link = d.approved ? `${siteUrl()}/editions/${d.slug}` : `${siteUrl()}/organisateur/evenements/${d.slug}`;
    const html = d.approved
      ? `${mailScript('C’est en ligne')}<h2>${esc(d.title)}</h2><p>Ta demande de publication est validée : la page de l’évènement est publique.</p>${mailButton(link, 'Voir la page')}`
      : `${mailScript('À corriger')}<h2>${esc(d.title)}</h2><p>Ta demande de publication a été refusée.</p><p><strong>Motif :</strong> ${esc(d.reason)}</p>${mailButton(link, 'Corriger l’évènement')}`;
    await deliver(d.requester_email ? [d.requester_email] : [], `${d.approved ? 'Publication validée' : 'Publication refusée'} : ${d.title}`, html);
  } catch (e) { console.error('[publication] e-mail de décision :', e); }
}
