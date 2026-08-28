'use client';

import { useState } from 'react';

export default function AdminLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Connexion refusée.');
    } catch {
      setError('Erreur réseau.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-shell">
      <form className="admin-card glass" onSubmit={submit}>
        <h1>Administration</h1>
        <p className="admin-hint">Accès réservé. Entre le mot de passe.</p>
        <label className="admin-field">
          <span>Mot de passe</span>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <p className="admin-error">{error}</p>}
        <button className="btn btn--amber" type="submit" disabled={busy || !password}>
          {busy ? 'Connexion…' : 'Entrer'}
        </button>
      </form>
    </main>
  );
}
