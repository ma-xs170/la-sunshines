// Persistance du store côté routes /api/admin : enveloppe writeStore() pour
// renvoyer une erreur EXPLOITABLE par l'admin plutôt qu'un 500 opaque.
//
// - ok:true  + deployed:true  → commit GitHub OK, redeploy Vercel en cours
// - ok:true  + deployed:false → écriture disque locale (dev)
// - ok:false + error          → message clair à renvoyer tel quel à l'admin

import { writeStore, type Store } from './store';
import { StoreWriteError, githubStoreEnabled } from './githubStore';

export type PersistResult =
  | { ok: true; deployed: boolean }
  | { ok: false; error: string };

export async function persistStore(store: Store): Promise<PersistResult> {
  try {
    await writeStore(store);
    return { ok: true, deployed: githubStoreEnabled() };
  } catch (e) {
    console.error('[persistStore] échec de l’enregistrement :', e);
    return {
      ok: false,
      error:
        e instanceof StoreWriteError
          ? e.message
          : 'Enregistrement impossible (erreur inattendue). Réessaie.',
    };
  }
}
