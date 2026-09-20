// Règles d'un message d'information de l'organisateur : PURES (testées sans réseau ni base).

/** Un message d'information ne contient aucun lien (ni promotion) : toute adresse web est refusée dans l'objet et le corps. */
export const URL_RE = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|fr|net|org|io|gp|shop|store|link|ly|co)\b)/i;

export function containsLink(...texts: string[]): boolean {
  return texts.some((t) => URL_RE.test(t));
}

export const MAX_MESSAGES_PER_DAY = 3;
export const MAX_RECIPIENTS = 500;
