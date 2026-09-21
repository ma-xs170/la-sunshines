'use client';

import type { ReactNode } from 'react';
import './wizard.css';

/** Indicateur d'étapes (liste ordonnée : lecteurs d'écran annoncent « étape en cours »). */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="wiz__steps" aria-label="Étapes">
      {steps.map((label, i) => (
        <li key={label} className={'wiz__step' + (i < current ? ' is-done' : '') + (i === current ? ' is-current' : '')} aria-current={i === current ? 'step' : undefined}>
          <span>{i + 1}. {label}</span>
        </li>
      ))}
    </ol>
  );
}

/** Champ avec libellé, aide et message d'erreur relié (aria-describedby) : le contrôle est fourni par `children(props)`. */
export function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: (p: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode }) {
  const desc = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={'wiz__field' + (error ? ' is-bad' : '')}>
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': desc })}
      {error ? <p className="wiz__err" id={`${id}-err`} role="alert">{error}</p> : hint ? <p className="wiz__hint" id={`${id}-hint`}>{hint}</p> : null}
    </div>
  );
}
