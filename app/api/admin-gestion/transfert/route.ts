import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminRpc, requireAdminApi } from '@/lib/adminSpace';
import { mailConfigured, sendMail } from '@/lib/mail';
import { revalidatePublicSite } from '@/lib/revalidate';
import { SLUG_RE } from '@/lib/ticketing/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ slug: z.string().regex(SLUG_RE), to: z.string().trim().max(20), confirm: z.string().trim().max(20).optional() });
interface Preview { event: string; from: { name: string; reference: string; email: string }; to: { name: string; reference: string; email: string }; orders: number; tickets: number; tiers: number; sold: number }

// POST { slug, to } → récapitulatif (ventes, commandes, tarifs conservés) ; POST { slug, to, confirm } → exécution ATOMIQUE en base si `confirm` = référence de destination.
// Un e-mail part aux deux parties (best-effort : un échec d'envoi n'annule jamais le transfert). Le transfert est journalisé ; aucune annulation directe.
export async function POST(req: Request) {
  const g = await requireAdminApi(); if (!g.ok) return g.res;
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  const { slug, to, confirm } = p.data;
  if (!confirm) {
    const r = await adminRpc<Preview>('admin_transfer_preview', { p_actor: g.s.userId, p_slug: slug, p_to_ref: to });
    return r.ok ? NextResponse.json(r.data) : NextResponse.json({ error: r.message }, { status: r.status });
  }
  const r = await adminRpc<Preview>('admin_transfer_event', { p_actor: g.s.userId, p_slug: slug, p_to_ref: to, p_confirm_ref: confirm });
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });
  revalidatePublicSite();
  let mails = 0;
  if (mailConfigured()) {
    for (const [party, other, kind] of [[r.data.from, r.data.to, 'cédé'], [r.data.to, r.data.from, 'reçu']] as const) {
      if (!party.email) continue;
      const ok = await sendMail({ to: party.email, subject: `Transfert d’évènement : ${slug}`, html: `<p>Bonjour,</p><p>L’évènement <strong>${slug}</strong> a été ${kind === 'cédé' ? 'transféré de' : 'transféré vers'} votre organisation (${party.reference}) ${kind === 'cédé' ? 'vers' : 'depuis'} ${other.name} (${other.reference}), à la demande de l’organisateur. Les commandes, billets et l’historique sont conservés.</p><p>Si vous n’êtes pas à l’origine de cette demande, contactez LA SUNSHINES.</p>` });
      if (ok) mails++;
    }
  }
  return NextResponse.json({ ok: true, ...r.data, mails });
}
