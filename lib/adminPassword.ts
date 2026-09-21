// Mot de passe provisoire d'un administrateur : aléatoire fort (20 caractères, 4 classes). JAMAIS affiché, journalisé ni stocké : il part par e-mail puis n'existe plus qu'en hachage chez Supabase Auth.
import { randomInt } from 'crypto';

const SETS = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%*?-_+='];
export function generatePassword(length = 20): string {
  const all = SETS.join('');
  const chars = SETS.map((s) => s[randomInt(s.length)]);          // au moins un caractère de chaque classe
  while (chars.length < length) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}

/** Nouveau mot de passe choisi par l'admin : 12 caractères minimum, au moins une lettre et un chiffre. */
export function passwordProblem(p: string): string | null {
  if (p.length < 12) return 'Le mot de passe doit faire au moins 12 caractères.';
  if (p.length > 72) return 'Le mot de passe ne peut pas dépasser 72 caractères.';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Utilise au moins une lettre et un chiffre.';
  return null;
}
