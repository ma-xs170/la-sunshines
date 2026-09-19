'use client';

import { useState } from 'react';
import Field from './Field';
import { postJson } from './api';

export default function ProfileForm({
  email,
  initial,
}: {
  email: string;
  initial: { first_name: string; last_name: string; phone: string };
}) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaved(false);
    setF((s) => ({ ...s, [k]: e.target.value }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    const r = await postJson('/api/account/profile', f, 'PATCH');
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setSaved(true);
  }

  return (
    <form className="contact-form glass auth-form" onSubmit={submit} noValidate>
      <Field label="Email" id="email" type="email" value={email} readOnly disabled
        hint="Pour changer d’adresse, contacte-nous." />
      <div className="auth-row">
        <Field label="Prénom" id="first_name" autoComplete="given-name"
          value={f.first_name} onChange={set('first_name')} required />
        <Field label="Nom" id="last_name" autoComplete="family-name"
          value={f.last_name} onChange={set('last_name')} required />
      </div>
      <Field label="Téléphone" id="phone" type="tel" autoComplete="tel" inputMode="tel"
        value={f.phone} onChange={set('phone')} required />
      {error && <p className="contact-form__error" role="alert">{error}</p>}
      {saved && <p className="auth-ok" role="status">Profil enregistré.</p>}
      <button className="btn btn--amber" type="submit" disabled={busy}>
        {busy ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </form>
  );
}
