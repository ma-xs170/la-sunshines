'use client';

import { useState } from 'react';
import Icon from './Icon';

export default function ArtistSubscribe({
  slug,
  name,
}: {
  slug: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<{ kind: 'idle' | 'ok' | 'err'; msg?: string }>({
    kind: 'idle',
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) {
      setState({ kind: 'err', msg: 'Coche la case de consentement.' });
      return;
    }
    setBusy(true);
    setState({ kind: 'idle' });
    try {
      const res = await fetch('/api/artists/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email, consent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ kind: 'err', msg: data.error ?? 'Une erreur est survenue.' });
        return;
      }
      setState({
        kind: 'ok',
        msg: data.already
          ? 'Tu es déjà abonné(e) à cet artiste.'
          : 'C’est fait ! Vérifie ta boîte mail.',
      });
      setEmail('');
      setConsent(false);
    } catch {
      setState({ kind: 'err', msg: 'Connexion impossible. Réessaie.' });
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === 'ok') {
    return (
      <p className="artist-cta__done">
        <Icon name="check" className="icon" /> {state.msg}
      </p>
    );
  }

  return (
    <div className="artist-cta">
      {!open ? (
        <button
          type="button"
          className="btn btn--outline"
          onClick={() => setOpen(true)}
        >
          <Icon name="bell" />
          <span>S’abonner aux annonces</span>
        </button>
      ) : (
        <form className="artist-cta__form glass" onSubmit={submit}>
          <p className="artist-cta__title">
            Recevoir un email quand <strong>{name}</strong> est à l’affiche
          </p>
          <input
            type="email"
            required
            placeholder="ton@email.fr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label className="artist-cta__consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              J’accepte de recevoir des emails de LA SUNSHINES pour les annonces
              liées à cet artiste. Désabonnement en 1 clic à tout moment.
            </span>
          </label>
          {state.kind === 'err' && (
            <p className="artist-cta__err">{state.msg}</p>
          )}
          <div className="artist-cta__row">
            <button className="btn btn--amber" type="submit" disabled={busy}>
              {busy ? '…' : 'S’abonner'}
            </button>
            <button
              className="btn btn--outline"
              type="button"
              onClick={() => setOpen(false)}
            >
              Annuler
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
