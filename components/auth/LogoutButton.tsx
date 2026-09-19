'use client';

import { useState } from 'react';
import { postJson } from './api';

export default function LogoutButton({ className = 'btn btn--outline' }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  async function out() {
    setBusy(true);
    await postJson('/api/auth/logout', {});
    window.location.assign('/');
  }
  return (
    <button type="button" className={className} onClick={out} disabled={busy}>
      {busy ? 'Déconnexion…' : 'Se déconnecter'}
    </button>
  );
}
