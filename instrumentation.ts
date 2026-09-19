// Exécuté une fois au démarrage du serveur Next (et pendant le build).
// Refuse de démarrer si une clé Stripe LIVE est présente dans l'environnement.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertStripeTestMode } = await import('./lib/stripe-guard');
    assertStripeTestMode();
  }
}
