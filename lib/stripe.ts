// Client Stripe SERVEUR — compte direct, MODE TEST uniquement (voir stripe-guard).
// Prêt pour Stripe Connect plus tard : connectOptions() ajoute l'en-tête
// Stripe-Account quand une commande porte un compte connecté (colonne
// orders.stripe_account_id, toujours null aujourd'hui → aucun effet).

import 'server-only';
import Stripe from 'stripe';
import { assertStripeTestMode } from './stripe-guard';

let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  assertStripeTestMode(); // ne jamais utiliser une clé live, même si l'instrumentation a été contournée
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY manquante.');
  if (!client) {
    // STRIPE_API_MOCK (host:port) : uniquement hors production, pour les tests automatisés.
    const mock = process.env.NODE_ENV !== 'production' ? process.env.STRIPE_API_MOCK : undefined;
    const [host, port] = mock ? mock.split(':') : [undefined, undefined];
    client = new Stripe(key, {
      maxNetworkRetries: 2,
      ...(mock ? { host, port: Number(port), protocol: 'http' as const } : {}),
    });
  }
  return client;
}

/** Options de requête Connect (aucune aujourd'hui). */
export function connectOptions(stripeAccountId?: string | null): { stripeAccount?: string } {
  return stripeAccountId ? { stripeAccount: stripeAccountId } : {};
}
