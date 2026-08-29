'use client';

import { useRef, useState } from 'react';
import Icon from './Icon';

const MAX_MB = 10;

export default function ArtistClaim({
  slug,
  name,
}: {
  slug: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [claimName, setClaimName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<{ kind: 'idle' | 'ok' | 'err'; msg?: string }>({
    kind: 'idle',
  });
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setState({ kind: 'err', msg: 'Ajoute une pièce d’identité.' });
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setState({ kind: 'err', msg: `Fichier trop lourd (max ${MAX_MB} Mo).` });
      return;
    }
    setBusy(true);
    setState({ kind: 'idle' });
    try {
      const fd = new FormData();
      fd.set('slug', slug);
      fd.set('name', claimName);
      fd.set('email', email);
      fd.set('file', file);
      const res = await fetch('/api/artists/claim', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ kind: 'err', msg: data.error ?? 'Une erreur est survenue.' });
        return;
      }
      setState({
        kind: 'ok',
        msg: 'Demande envoyée. On revient vers toi par email après vérification.',
      });
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
          <Icon name="shield" />
          <span>Réclamer cette page</span>
        </button>
      ) : (
        <form className="artist-cta__form glass" onSubmit={submit}>
          <p className="artist-cta__title">
            Tu es <strong>{name}</strong> ? Fais vérifier ta page.
          </p>
          <p className="artist-cta__note">
            Ta pièce d’identité sert uniquement à la vérification manuelle par
            notre équipe. Elle est stockée de façon privée et
            <strong> supprimée dès que la décision est prise</strong> — seul le
            statut « vérifié » est conservé.
          </p>
          <input
            required
            placeholder="Ton nom"
            value={claimName}
            onChange={(e) => setClaimName(e.target.value)}
          />
          <input
            type="email"
            required
            placeholder="Email de contact"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label className="artist-cta__file">
            <span>Pièce d’identité (image ou PDF, {MAX_MB} Mo max)</span>
            <input
              ref={fileRef}
              type="file"
              required
              accept="image/*,application/pdf"
            />
          </label>
          {state.kind === 'err' && <p className="artist-cta__err">{state.msg}</p>}
          <div className="artist-cta__row">
            <button className="btn btn--amber" type="submit" disabled={busy}>
              {busy ? 'Envoi…' : 'Envoyer la demande'}
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
