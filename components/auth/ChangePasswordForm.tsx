'use client';

import { useState } from 'react';
import Field from './Field';
import { postJson } from './api';

/** Changement de mot de passe (obligatoire à la première connexion d'un administrateur). */
export default function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError('Les deux mots de passe ne correspondent pas.');
    setBusy(true); setError('');
    const r = await postJson('/api/auth/change-password', { password });
    if (!r.ok) { setError(r.error); setBusy(false); return; }
    window.location.assign(forced ? '/admin/gestion' : '/compte?mdp=ok');
  }
  return (
    <form className="contact-form glass auth-form" onSubmit={submit} noValidate>
      {forced && <p className="org-muted">Pour ta sécurité, choisis ton propre mot de passe avant d’accéder à l’administration.</p>}
      <Field label="Nouveau mot de passe" id="password" type="password" autoComplete="new-password" hint="12 caractères minimum, avec au moins une lettre et un chiffre." value={password} onChange={(e) => setPassword(e.target.value)} required />
      <Field label="Confirmer" id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      {error && <p className="contact-form__error" role="alert">{error}</p>}
      <button className="btn btn--amber" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Changer le mot de passe'}</button>
    </form>
  );
}
