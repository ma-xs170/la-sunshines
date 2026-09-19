'use client';

import { useState } from 'react';
import Field from './Field';
import { postJson } from './api';

export default function ResetForm() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError('Les deux mots de passe ne correspondent pas.');
    setBusy(true);
    setError('');
    const r = await postJson('/api/auth/reset-password', { password });
    if (!r.ok) {
      setError(r.error);
      setBusy(false);
      return;
    }
    window.location.assign('/compte?mdp=ok');
  }

  return (
    <form className="contact-form glass auth-form" onSubmit={submit} noValidate>
      <Field label="Nouveau mot de passe" id="password" type="password" autoComplete="new-password"
        hint="8 caractères minimum." value={password} onChange={(e) => setPassword(e.target.value)} required />
      <Field label="Confirmer" id="confirm" type="password" autoComplete="new-password"
        value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      {error && <p className="contact-form__error" role="alert">{error}</p>}
      <button className="btn btn--amber" type="submit" disabled={busy}>
        {busy ? 'Enregistrement…' : 'Changer le mot de passe'}
      </button>
    </form>
  );
}
