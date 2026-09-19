'use client';

import { useState } from 'react';
import Field from './Field';
import GoogleButton from './GoogleButton';
import { postJson } from './api';

export default function LoginForm({ next, google }: { next: string; google: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await postJson<{ next: string }>('/api/auth/login', { email, password, next });
    if (!r.ok) {
      setError(r.error);
      setBusy(false);
      return;
    }
    // rechargement complet : le header et les pages serveur relisent la session
    window.location.assign(r.data.next || '/compte');
  }

  return (
    <form className="contact-form glass auth-form" onSubmit={submit} noValidate>
      {google && <GoogleButton next={next} />}
      <Field label="Email" id="email" type="email" autoComplete="email" inputMode="email"
        value={email} onChange={(e) => setEmail(e.target.value)} required />
      <Field label="Mot de passe" id="password" type="password" autoComplete="current-password"
        value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p className="contact-form__error" role="alert">{error}</p>}
      <button className="btn btn--amber" type="submit" disabled={busy}>
        {busy ? 'Connexion…' : 'Se connecter'}
      </button>
      <p className="auth-links">
        <a href="/mot-de-passe-oublie">Mot de passe oublié ?</a>
        <a href={`/inscription${next !== '/compte' ? `?next=${encodeURIComponent(next)}` : ''}`}>
          Créer un compte
        </a>
      </p>
    </form>
  );
}
