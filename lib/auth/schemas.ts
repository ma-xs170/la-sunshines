// Validation des entrées d'authentification (zod). Messages en français,
// renvoyés tels quels à l'utilisateur.

import { z } from 'zod';

const email = z
  .string({ error: 'Indique ton adresse email.' })
  .trim()
  .toLowerCase()
  .pipe(z.email('Adresse email invalide.'))
  .refine((v) => v.length <= 254, 'Adresse email invalide.');

// 72 = limite de bcrypt (au-delà le mot de passe serait tronqué en silence).
const password = z
  .string({ error: 'Indique un mot de passe.' })
  .min(8, 'Le mot de passe doit faire au moins 8 caractères.')
  .max(72, 'Le mot de passe ne peut pas dépasser 72 caractères.');

const firstName = z
  .string({ error: 'Indique ton prénom.' })
  .trim()
  .min(1, 'Indique ton prénom.')
  .max(60, 'Prénom trop long.');

const lastName = z
  .string({ error: 'Indique ton nom.' })
  .trim()
  .min(1, 'Indique ton nom.')
  .max(60, 'Nom trop long.');

const phone = z
  .string({ error: 'Indique un numéro de téléphone.' })
  .trim()
  .regex(/^\+?[0-9][0-9 .()-]{5,19}$/, 'Numéro de téléphone invalide.');

export const signupSchema = z.object({
  email,
  password,
  first_name: firstName,
  last_name: lastName,
  phone,
  next: z.string().max(200).optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string({ error: 'Indique ton mot de passe.' }).min(1, 'Indique ton mot de passe.').max(200),
  next: z.string().max(200).optional(),
});

export const forgotSchema = z.object({ email });

export const resetSchema = z.object({ password });

export const profileSchema = z.object({
  first_name: firstName,
  last_name: lastName,
  phone,
});

export const confirmSchema = z.object({
  token_hash: z.string().min(10).max(500),
  type: z.enum(['email', 'signup', 'recovery', 'magiclink', 'email_change', 'invite']),
});

/** Premier message d'erreur lisible d'un échec de validation. */
export function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? 'Données invalides.';
}

/**
 * Redirection post-connexion : uniquement un chemin INTERNE (anti open-redirect).
 * « //evil.com », « /\evil.com » et les URL absolues sont refusés.
 */
export function safeNext(raw: string | null | undefined, fallback = '/compte'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return fallback;
  }
  return raw;
}
