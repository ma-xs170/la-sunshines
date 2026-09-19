// Appel JSON vers nos routes /api/auth et /api/account. Renvoie toujours un
// résultat typé (jamais d'exception) pour simplifier les formulaires.

export type ApiResult<T = Record<string, unknown>> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function postJson<T = Record<string, unknown>>(
  url: string,
  body: unknown,
  method: 'POST' | 'PATCH' = 'POST',
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error ?? 'Une erreur est survenue. Réessaie.' };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: 'Connexion impossible. Vérifie ton réseau.' };
  }
}
