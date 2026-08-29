// Écriture du contenu admin EN PRODUCTION.
//
// Le FS de Vercel est en lecture seule (hors /tmp, éphémère) : on ne peut donc
// pas y persister data/content.json. À la place, on committe le fichier
// directement sur GitHub via l'API Contents. Le commit sur `main` déclenche
// l'auto-deploy Vercel déjà configuré → le contenu est en ligne au redéploiement
// (≈ 1 min). C'est exactement le comportement annoncé dans l'UI admin.
//
// En local (pas de GITHUB_TOKEN) : writeStore() retombe sur une écriture disque
// classique — voir lib/store.ts.
//
// SERVEUR UNIQUEMENT. Le token n'est jamais exposé au client.

const OWNER = process.env.GITHUB_REPO_OWNER || 'ma-xs170';
const REPO = process.env.GITHUB_REPO_NAME || 'la-sunshines';
const BRANCH = process.env.GITHUB_REPO_BRANCH || 'main';
const FILE_PATH = 'data/content.json';
const COMMIT_MESSAGE = 'admin: mise à jour du contenu';

const CONTENTS_URL = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`;

/** Erreur d'écriture « métier » : message directement affichable à l'admin. */
export class StoreWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreWriteError';
  }
}

/** true si l'écriture doit passer par GitHub (token présent = prod). */
export function githubStoreEnabled(): boolean {
  return Boolean(process.env.GITHUB_TOKEN);
}

function ghHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'la-sunshines-admin',
  };
}

/** SHA du blob actuel de data/content.json (nécessaire pour un PUT de mise à
 *  jour). `undefined` si le fichier n'existe pas encore sur la branche. */
async function currentFileSha(): Promise<string | undefined> {
  const res = await fetch(`${CONTENTS_URL}?ref=${encodeURIComponent(BRANCH)}`, {
    headers: ghHeaders(),
    cache: 'no-store',
  });
  if (res.status === 404) return undefined;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new StoreWriteError(
      `Lecture du fichier sur GitHub impossible (HTTP ${res.status}). ${body.slice(0, 180)}`,
    );
  }
  const json = (await res.json()) as { sha?: string };
  return typeof json.sha === 'string' ? json.sha : undefined;
}

/** Committe le JSON fourni sur data/content.json (branche `main`). */
export async function commitStoreToGithub(json: string): Promise<void> {
  if (!process.env.GITHUB_TOKEN) {
    throw new StoreWriteError(
      'GITHUB_TOKEN absent : l’enregistrement en production est impossible. ' +
        'Ajoute la variable d’environnement sur Vercel.',
    );
  }

  let sha: string | undefined;
  try {
    sha = await currentFileSha();
  } catch (e) {
    if (e instanceof StoreWriteError) throw e;
    throw new StoreWriteError(
      'Impossible de joindre GitHub pour lire l’état du fichier. Réessaie dans un instant.',
    );
  }

  let res: Response;
  try {
    res = await fetch(CONTENTS_URL, {
      method: 'PUT',
      headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: COMMIT_MESSAGE,
        content: Buffer.from(json, 'utf8').toString('base64'),
        branch: BRANCH,
        ...(sha ? { sha } : {}),
      }),
    });
  } catch {
    throw new StoreWriteError(
      'Impossible de joindre GitHub pour enregistrer. Vérifie la connexion et réessaie.',
    );
  }

  if (res.ok) return;

  const body = await res.text().catch(() => '');
  if (res.status === 409 || res.status === 422) {
    throw new StoreWriteError(
      'Conflit : le contenu a changé entre-temps sur GitHub. Recharge la page /admin puis refais ta modification.',
    );
  }
  if (res.status === 401 || res.status === 403) {
    // 403 peut aussi être un rate limit
    const rateLimited = /rate limit/i.test(body);
    throw new StoreWriteError(
      rateLimited
        ? 'Limite de requêtes GitHub atteinte. Réessaie dans quelques minutes.'
        : `GitHub a refusé l’écriture (HTTP ${res.status}) : token invalide, expiré ou sans le scope « Contents / repo ».`,
    );
  }
  throw new StoreWriteError(
    `Commit GitHub échoué (HTTP ${res.status}). ${body.slice(0, 180)}`,
  );
}
