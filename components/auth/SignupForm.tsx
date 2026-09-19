'use client';

import { useState } from 'react';
import Field from './Field';
import GoogleButton from './GoogleButton';
import { postJson } from './api';

export default function SignupForm({ next, google }: { next: string; google: boolean }) {
  const [f, setF] = useState({
    first_name: '', last_name: '', phone: '', email: '', password: '', website: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await postJson<{ needsConfirmation: boolean; next: string }>(
      '/api/auth/signup',
      { ...f, next },
    );
    if (!r.ok) {
      setError(r.error);
      setBusy(false);
      return;
    }
    if (r.data.needsConfirmation) {
      setSentTo(f.email.trim().toLowerCase());
      setBusy(false);
      return;
    }
    window.location.assign(r.data.next || '/compte');
  }

  if (sentTo) {
    return (
      <div className="contact-form glass contact-form--done" role="status">
        <h2>Vérifie ta boîte mail</h2>
        <p>
          On a envoyé un lien de confirmation à <strong>{sentTo}</strong>. Clique dessus pour
          activer ton compte, puis connecte-toi. Pense à regarder tes spams.
        </p>
        <a className="btn btn--outline" href="/connexion">Aller à la connexion</a>
      </div>
    );
  }

  return (
    <form className="contact-form glass auth-form" onSubmit={submit} noValidate>
      {google && <GoogleButton next={next} />}
      <div className="auth-row">
        <Field label="Prénom" id="first_name" autoComplete="given-name"
          value={f.first_name} onChange={set('first_name')} required />
        <Field label="Nom" id="last_name" autoComplete="family-name"
          value={f.last_name} onChange={set('last_name')} required />
      </div>
      <Field label="Téléphone" id="phone" type="tel" autoComplete="tel" inputMode="tel"
        hint="Un numéro où te joindre (ou joindre un parent) le jour de la soirée."
        value={f.phone} onChange={set('phone')} required />
      <Field label="Email" id="email" type="email" autoComplete="email" inputMode="email"
        value={f.email} onChange={set('email')} required />
      <Field label="Mot de passe" id="password" type="password" autoComplete="new-password"
        hint="8 caractères minimum."
        value={f.password} onChange={set('password')} required />
      {/* honeypot : invisible pour un humain */}
      <div className="contact-hp" aria-hidden="true">
        <label htmlFor="website">Ne pas remplir</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off"
          value={f.website} onChange={set('website')} />
      </div>
      {error && <p className="contact-form__error" role="alert">{error}</p>}
      <button className="btn btn--amber" type="submit" disabled={busy}>
        {busy ? 'Création…' : 'Créer mon compte'}
      </button>
      <p className="auth-links">
        <span>Déjà un compte ?</span>
        <a href="/connexion">Se connecter</a>
      </p>
    </form>
  );
}
