'use client';

import { useState } from 'react';
import Field from './Field';
import { postJson } from './api';

export default function ForgotForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await postJson('/api/auth/forgot-password', { email });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setDone(true);
  }

  if (done) {
    return (
      <div className="contact-form glass contact-form--done" role="status">
        <h2>Email envoyé</h2>
        <p>
          Si un compte existe pour cette adresse, tu vas recevoir un lien pour choisir un nouveau
          mot de passe. Pense à regarder tes spams.
        </p>
      </div>
    );
  }

  return (
    <form className="contact-form glass auth-form" onSubmit={submit} noValidate>
      <Field label="Email" id="email" type="email" autoComplete="email" inputMode="email"
        value={email} onChange={(e) => setEmail(e.target.value)} required />
      {error && <p className="contact-form__error" role="alert">{error}</p>}
      <button className="btn btn--amber" type="submit" disabled={busy}>
        {busy ? 'Envoi…' : 'Recevoir le lien'}
      </button>
      <p className="auth-links"><a href="/connexion">Retour à la connexion</a></p>
    </form>
  );
}
