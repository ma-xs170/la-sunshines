// Garde « Stripe en MODE TEST uniquement ». Aucune dépendance : importable depuis
// instrumentation.ts (démarrage du serveur) comme depuis les routes.
//
// Règle : le projet refuse de démarrer si UNE variable d'environnement contient une
// clé Stripe LIVE (sk_live_ / rk_live_ / pk_live_), et STRIPE_SECRET_KEY doit être une
// clé de test. Pour passer en production réelle, ce garde-fou devra être retiré
// volontairement (décision explicite, pas un simple changement de variable).

const LIVE_KEY = /^(sk|rk|pk)_live_/;

/** Nom de la première variable contenant une clé LIVE, ou null. */
export function findLiveStripeKey(env: NodeJS.ProcessEnv = process.env): string | null {
  for (const [name, value] of Object.entries(env)) {
    if (typeof value === 'string' && LIVE_KEY.test(value.trim())) return name;
  }
  return null;
}

export function assertStripeTestMode(env: NodeJS.ProcessEnv = process.env): void {
  const live = findLiveStripeKey(env);
  if (live) {
    throw new Error(
      `[stripe] Clé Stripe LIVE détectée dans ${live} : refus de démarrer. ` +
        'Cette billetterie fonctionne en MODE TEST uniquement (sk_test_ / pk_test_).',
    );
  }
  const sk = env.STRIPE_SECRET_KEY?.trim();
  if (sk && !/^(sk|rk)_test_/.test(sk)) {
    throw new Error('[stripe] STRIPE_SECRET_KEY doit être une clé de TEST (sk_test_…).');
  }
  const pk = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  if (pk && !/^pk_test_/.test(pk)) {
    throw new Error('[stripe] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY doit être une clé de TEST (pk_test_…).');
  }
}
