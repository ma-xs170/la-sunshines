// Petits utilitaires communs aux routes d'authentification.

import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { firstIssue } from './schemas';

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Lit et valide le corps JSON ; renvoie les données ou une réponse d'erreur 400. */
export async function parseBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<{ data: z.output<S> } | { res: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { res: fail('Requête invalide.') };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { res: fail(firstIssue(parsed.error)) };
  return { data: parsed.data };
}

/** Origine publique de la requête (pour les liens envoyés par email). */
export function originOf(req: Request): string {
  return new URL(req.url).origin;
}

export const TOO_MANY = 'Trop de tentatives. Réessaie dans quelques minutes.';
export const UNAVAILABLE = 'Les comptes ne sont pas encore disponibles.';

/** Erreur Supabase Auth due à une indisponibilité (réseau, 5xx), pas à l'utilisateur. */
export function isOutage(err: { status?: number; name?: string }): boolean {
  return (
    err.name === 'AuthRetryableFetchError' ||
    err.status === undefined ||
    err.status === 0 ||
    err.status >= 500
  );
}
