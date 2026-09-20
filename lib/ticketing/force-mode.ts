// Interrupteur de TEST : TICKETING_FORCE_MODE=internal active la billetterie interne SUR CET ENVIRONNEMENT SEULEMENT,
// sans toucher au réglage stocké en base (app_settings.ticketing_mode), qui est partagé avec la production.
//
// Règles (strictes, testées dans tests/unit/force-mode.test.mjs) :
//  * la valeur doit être exactement « internal » (rien d'autre n'active quoi que ce soit) ;
//  * JAMAIS en production : VERCEL_ENV=production → ignoré, même si la variable y est définie par erreur ;
//  * actif en local (VERCEL_ENV absent) et sur Preview (VERCEL_ENV=preview).

export type ForceEnv = Record<string, string | undefined>;

export function resolveForcedMode(env: ForceEnv): 'native' | null {
  if ((env.TICKETING_FORCE_MODE ?? '').trim() !== 'internal') return null;
  if ((env.VERCEL_ENV ?? '').trim().toLowerCase() === 'production') return null;
  return 'native';
}

/** Vrai si la variable est définie mais neutralisée parce qu'on est en production (pour l'avertir dans les logs). */
export function forceModeIgnoredInProduction(env: ForceEnv): boolean {
  return (env.TICKETING_FORCE_MODE ?? '').trim() !== '' && (env.VERCEL_ENV ?? '').trim().toLowerCase() === 'production';
}
