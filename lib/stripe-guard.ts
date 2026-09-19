// Politique des clés Stripe. Aucune dépendance : importable depuis instrumentation.ts
// (démarrage du serveur) comme depuis les routes.
//
// RÈGLES
//  * Clé LIVE (sk_live_ / rk_live_ / pk_live_) : acceptée UNIQUEMENT si VERCEL_ENV === "production".
//    Sur Preview, en local, ou partout ailleurs, sa simple présence dans l'environnement
//    fait REFUSER le démarrage.
//  * Clé de TEST : toujours acceptée ; en production, un avertissement clair est journalisé
//    (les paiements ne seraient alors pas réels).
//  * STRIPE_SECRET_KEY doit être une clé Stripe valide (sk_/rk_ test ou live).

const LIVE_KEY = /^(sk|rk|pk)_live_/;
const TEST_KEY = /^(sk|rk|pk)_test_/;

export type StripeMode = 'live' | 'test' | 'none';

/** Nom de la première variable contenant une clé LIVE, ou null. */
export function findLiveStripeKey(env: NodeJS.ProcessEnv = process.env): string | null {
  for (const [name, value] of Object.entries(env)) {
    if (typeof value === 'string' && LIVE_KEY.test(value.trim())) return name;
  }
  return null;
}

export function isVercelProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === 'production';
}

/** Mode de la clé secrète configurée (live / test / none). */
export function stripeMode(env: NodeJS.ProcessEnv = process.env): StripeMode {
  const sk = env.STRIPE_SECRET_KEY?.trim();
  if (!sk) return 'none';
  return LIVE_KEY.test(sk) ? 'live' : 'test';
}

/**
 * Lève une erreur (= refus de démarrer) si la politique est violée.
 * Renvoie un avertissement à journaliser si une clé de test est utilisée en production.
 */
export function assertStripeKeyPolicy(env: NodeJS.ProcessEnv = process.env): { warning?: string } {
  const production = isVercelProduction(env);

  const live = findLiveStripeKey(env);
  if (live && !production) {
    throw new Error(
      `[stripe] Clé Stripe LIVE détectée dans ${live} hors production (VERCEL_ENV=${env.VERCEL_ENV ?? 'absent'}) : refus de démarrer. ` +
        'Les clés live ne sont acceptées que sur le déploiement de production Vercel ; ailleurs, utilise des clés de test (sk_test_ / pk_test_).',
    );
  }

  const sk = env.STRIPE_SECRET_KEY?.trim();
  if (sk && !LIVE_KEY.test(sk) && !TEST_KEY.test(sk)) {
    throw new Error('[stripe] STRIPE_SECRET_KEY invalide : elle doit commencer par sk_test_ (test) ou sk_live_ (production).');
  }
  const pk = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  if (pk && !/^pk_(test|live)_/.test(pk)) {
    throw new Error('[stripe] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY invalide : elle doit commencer par pk_test_ ou pk_live_.');
  }
  // cohérence : pas de clé secrète live avec une publique de test (ou l'inverse)
  if (sk && pk && LIVE_KEY.test(sk) !== LIVE_KEY.test(pk)) {
    throw new Error('[stripe] Clés incohérentes : la clé secrète et la clé publique ne sont pas du même mode (test / live).');
  }

  if (production && sk && TEST_KEY.test(sk)) {
    return {
      warning:
        '[stripe] ⚠️ ATTENTION : la PRODUCTION utilise une clé Stripe de TEST (sk_test_…). Les paiements ne sont PAS réels ' +
        'et aucun argent ne sera encaissé. Pour vendre pour de vrai, configure sk_live_ dans les variables Production de Vercel.',
    };
  }
  return {};
}
