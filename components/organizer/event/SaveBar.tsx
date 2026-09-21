'use client';

/** Barre « Enregistrer » collée en bas de l'écran : statut, erreur lisible, annulation des modifications. */
export default function SaveBar({ dirty, busy, error, done, restored, onSave, onDiscard }: { dirty: boolean; busy: boolean; error: string; done: boolean; restored: boolean; onSave: () => void; onDiscard: () => void }) {
  return (
    <div className="ef-savebar" role="region" aria-label="Enregistrement">
      <p className="ef-savebar__msg" role="status" aria-live="polite">
        {error ? <span className="ef-err">{error}</span>
          : restored && dirty ? 'Brouillon récupéré sur cet appareil : vérifie puis enregistre.'
          : dirty ? 'Modifications non enregistrées.' : done ? 'Enregistré.' : 'Aucune modification.'}
      </p>
      {dirty && <button type="button" className="btn btn--outline" onClick={onDiscard} disabled={busy}>Annuler</button>}
      <button type="button" className="btn btn--amber" onClick={onSave} disabled={!dirty || busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
    </div>
  );
}
