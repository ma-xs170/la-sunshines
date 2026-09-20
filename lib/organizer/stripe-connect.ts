// Compte Stripe connecté d'une organisation (Connect « Express ») : création, lien d'inscription, état, accès au tableau de bord Stripe.
// SERVEUR UNIQUEMENT. Seul le propriétaire (ou l'admin) y accède ; la base revérifie (org_stripe_*). Cet identifiant NE change PAS
// le flux d'encaissement des commandes (connectOptions reste vide) : il prépare les versements.
import 'server-only';
import { getStripe, stripeConfigured } from '@/lib/stripe';
import { siteUrl } from '@/lib/mail';
import { orgRpc, type OrgResult } from './data';

export interface StripeAccountRow { account_id: string; ready: boolean; email: string; name: string }
export type StripeStatus = 'none' | 'pending' | 'ready';

export const statusOf = (a: { account_id: string; ready: boolean }): StripeStatus => (!a.account_id ? 'none' : a.ready ? 'ready' : 'pending');

const fail = (status: number, message: string): OrgResult<never> => ({ ok: false, error: { status, message } });

/** Interroge Stripe et enregistre l'état « prêt » (paiements ET versements activés, informations transmises). */
export async function syncStripe(actor: string, org: string): Promise<OrgResult<{ status: StripeStatus }>> {
  const cur = await orgRpc<StripeAccountRow>('org_stripe_account', { p_actor: actor, p_org: org });
  if (!cur.ok) return cur;
  if (!cur.data.account_id) return { ok: true, data: { status: 'none' } };
  if (!stripeConfigured()) return fail(503, 'Le paiement en ligne n’est pas configuré.');
  try {
    const acc = await getStripe().accounts.retrieve(cur.data.account_id);
    const ready = Boolean(acc.charges_enabled && acc.payouts_enabled && acc.details_submitted);
    const set = await orgRpc('org_stripe_set', { p_actor: actor, p_org: org, p_account: cur.data.account_id, p_ready: ready });
    if (!set.ok) return set;
    return { ok: true, data: { status: ready ? 'ready' : 'pending' } };
  } catch (e) {
    console.error('[stripe-connect] sync :', (e as Error).message);
    return fail(502, 'Stripe ne répond pas pour l’instant. Réessaie dans un moment.');
  }
}

/** Crée le compte connecté s'il n'existe pas (idempotent), puis renvoie le lien d'inscription Stripe. */
export async function startOnboarding(actor: string, org: string): Promise<OrgResult<{ url: string }>> {
  const cur = await orgRpc<StripeAccountRow>('org_stripe_account', { p_actor: actor, p_org: org });
  if (!cur.ok) return cur;
  if (!stripeConfigured()) return fail(503, 'Le paiement en ligne n’est pas configuré.');
  const stripe = getStripe();
  try {
    let id = cur.data.account_id;
    if (!id) {
      const acc = await stripe.accounts.create(
        {
          type: 'express', country: 'FR', ...(cur.data.email ? { email: cur.data.email } : {}),
          business_profile: { name: cur.data.name },
          capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
          metadata: { organizer_id: org },
        },
        { idempotencyKey: `org-account:${org}` },   // un double clic ne crée pas deux comptes
      );
      id = acc.id;
      const set = await orgRpc('org_stripe_set', { p_actor: actor, p_org: org, p_account: id, p_ready: false });
      if (!set.ok) return set;
    }
    const base = siteUrl();
    const link = await stripe.accountLinks.create({ account: id, type: 'account_onboarding', refresh_url: `${base}/organisateur/paiements?retour=relance`, return_url: `${base}/organisateur/paiements?retour=ok` });
    return { ok: true, data: { url: link.url } };
  } catch (e) {
    console.error('[stripe-connect] onboarding :', (e as Error).message);
    return fail(502, 'Stripe n’a pas pu ouvrir l’inscription. Réessaie dans un moment.');
  }
}

/** Lien à usage unique vers le tableau de bord Stripe de l'organisation (compte prêt uniquement). */
export async function dashboardLink(actor: string, org: string): Promise<OrgResult<{ url: string }>> {
  const cur = await orgRpc<StripeAccountRow>('org_stripe_account', { p_actor: actor, p_org: org });
  if (!cur.ok) return cur;
  if (!cur.data.account_id || !cur.data.ready) return fail(409, 'Le compte Stripe n’est pas encore actif.');
  if (!stripeConfigured()) return fail(503, 'Le paiement en ligne n’est pas configuré.');
  try {
    const l = await getStripe().accounts.createLoginLink(cur.data.account_id);
    return { ok: true, data: { url: l.url } };
  } catch (e) {
    console.error('[stripe-connect] login link :', (e as Error).message);
    return fail(502, 'Stripe ne répond pas pour l’instant.');
  }
}
