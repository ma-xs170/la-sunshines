'use client';

import { useState } from 'react';

/** Bouton « Copier le lien » avec retour visuel « Copié ! » (annonce vocale via aria-live). */
export default function CopyLink({ value, label = 'Copier le lien' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  async function copy() {
    setFailed(false);
    try { await navigator.clipboard.writeText(value); }
    catch {
      // presse-papiers indisponible (http, iframe) : repli par sélection temporaire
      try { const t = document.createElement('textarea'); t.value = value; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); if (!ok) throw new Error('copy'); }
      catch { setFailed(true); return; }
    }
    setDone(true); window.setTimeout(() => setDone(false), 2000);
  }
  return (
    <>
      <button type="button" className={'btn ' + (done ? 'btn--amber' : 'btn--outline')} onClick={copy}>{done ? 'Copié !' : label}</button>
      <span className="sr-only" role="status">{done ? 'Lien copié' : failed ? 'Copie impossible' : ''}</span>
      {failed && <span className="org-muted">Copie impossible : sélectionne le lien à la main.</span>}
    </>
  );
}
