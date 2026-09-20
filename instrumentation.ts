// Exécuté une fois au démarrage du serveur Next (et pendant le build).
//  * refuse de démarrer si une clé Stripe LIVE est présente hors production Vercel
//    (Preview, local…) — voir lib/stripe-guard.ts ;
//  * en production, journalise un avertissement clair si une clé de TEST est utilisée.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertStripeKeyPolicy } = await import('./lib/stripe-guard');
    const { warning } = assertStripeKeyPolicy();
    if (warning) console.warn(warning);
    const { forceModeIgnoredInProduction } = await import('./lib/ticketing/force-mode');
    if (forceModeIgnoredInProduction(process.env)) {
      console.warn('[billetterie] TICKETING_FORCE_MODE est défini en PRODUCTION : ignoré (le mode vient uniquement de la base). Supprime cette variable.');
    }
  }
}
