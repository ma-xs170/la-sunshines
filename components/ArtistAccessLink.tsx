'use client';

// Petit lien discret en bas de la page artiste (uniquement si la page est
// vérifiée) : « Vous êtes cet artiste ? » → reçoit un nouveau lien magique.
// Si une session artiste existe déjà pour CE slug → lien direct « Modifier ma page ».

import { useEffect, useState } from 'react';
import Icon from '@/components/Icon';

export default function ArtistAccessLink({ slug }: { slug: string }) {
  const [mine, setMine] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<
    { kind: 'idle' | 'busy' } | { kind: 'done' | 'err'; msg: string }
  >({ kind: 'idle' });

  useEffect(() => {
    let alive = true;
    fetch('/api/artist/session')
      .then((r) => r.json())
      .then((d) => {
        if (alive) setMine(d?.slug === slug);
      })
      .catch(() => {
        if (alive) setMine(false);
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  if (mine) {
    return (
      <div className="artist-access">
        <a className="artist-access__link" href={`/artistes/${slug}/modifier`}>
          <Icon name="sparkles" className="icon" />
          Modifier ma page
        </a>
      </div>
    );
  }

  async function request() {
    setState({ kind: 'busy' });
    try {
      const res = await fetch('/api/artist/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ kind: 'err', msg: data.error ?? 'Réessaie plus tard.' });
        return;
      }
      setState({
        kind: 'done',
        msg:
          data.message ??
          'Si cette page est vérifiée, un lien de connexion vient d’être envoyé.',
      });
    } catch {
      setState({ kind: 'err', msg: 'Réessaie plus tard.' });
    }
  }

  if (state.kind === 'done') {
    return (
      <div className="artist-access">
        <p className="artist-access__done">
          <Icon name="check" className="icon" /> {state.msg}
        </p>
      </div>
    );
  }

  return (
    <div className="artist-access">
      {!open ? (
        <button
          type="button"
          className="artist-access__toggle"
          onClick={() => setOpen(true)}
        >
          Vous êtes cet artiste ? Recevoir un lien de connexion
        </button>
      ) : (
        <div className="artist-access__box">
          <p>
            Un lien de connexion à usage unique sera envoyé à l’adresse email de
            l’artiste.
          </p>
          {state.kind === 'err' && (
            <p className="artist-access__err">{state.msg}</p>
          )}
          <div className="artist-access__row">
            <button
              type="button"
              className="btn btn--amber"
              onClick={request}
              disabled={state.kind === 'busy'}
            >
              {state.kind === 'busy' ? '…' : 'Envoyer le lien'}
            </button>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => setOpen(false)}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
