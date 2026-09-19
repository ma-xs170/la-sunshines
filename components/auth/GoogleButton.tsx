'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export default function GoogleButton({ next = '/compte' }: { next?: string }) {
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(false);
  }

  return (
    <>
      <button type="button" className="btn btn--outline auth-google" onClick={go} disabled={busy}>
        Continuer avec Google
      </button>
      <p className="auth-divider" aria-hidden="true">
        <span>ou</span>
      </p>
    </>
  );
}
