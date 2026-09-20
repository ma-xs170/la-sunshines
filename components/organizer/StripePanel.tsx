'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { StripeStatus } from '@/lib/organizer/stripe-connect';

const COPY: Record<StripeStatus, { title: string; text: string; cls: string }> = {
  none: { title: 'Compte non connecté', text: 'Stripe, notre prestataire de paiement, a besoin des détails de votre organisation pour traiter les paiements et envoyer les versements.', cls: 'org-state--draft' },
  pending: { title: 'Inscription à terminer', text: 'Votre compte est créé, mais Stripe attend encore des informations (identité, coordonnées bancaires). Reprenez là où vous vous êtes arrêté.', cls: 'org-state--draft' },
  ready: { title: 'Compte actif', text: 'Stripe a validé votre compte : paiements et versements sont activés.', cls: 'org-state--on_sale' },
};

/** Compte de paiement Stripe de l'organisation : inscription, reprise, actualisation de l'état, accès au tableau de bord Stripe. */
export default function StripePanel({ org, status }: { org: string; status: StripeStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const c = COPY[status];

  async function call(kind: 'connect' | 'sync' | 'dashboard') {
    setBusy(kind); setErr('');
    const r = await fetch(`/api/organisateur/paiements/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ org }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setBusy(''); setErr(j.error ?? 'Échec.'); return; }
    if (kind === 'sync') { setBusy(''); router.refresh(); return; }
    window.location.assign(j.url);   // Stripe (inscription ou tableau de bord)
  }

  return (
    <section className="glass org-panel org-stripe" aria-labelledby="org-stripe-h">
      <div className="org-stripe__head">
        <h2 id="org-stripe-h">Compte de paiement Stripe</h2>
        <span className={`org-state ${c.cls}`}>{c.title}</span>
      </div>
      <p className="org-muted">{c.text}</p>
      {err && <p className="admin-error" role="alert">{err}</p>}
      <div className="org-stripe__actions">
        {status !== 'ready' && <button type="button" className="btn btn--amber" disabled={!!busy} onClick={() => call('connect')}>{busy === 'connect' ? 'Ouverture…' : status === 'none' ? 'Connecter Stripe' : 'Continuer l’inscription'}</button>}
        {status === 'pending' && <button type="button" className="btn btn--outline" disabled={!!busy} onClick={() => call('sync')}>{busy === 'sync' ? 'Actualisation…' : 'Actualiser l’état'}</button>}
        {status === 'ready' && <button type="button" className="btn btn--outline" disabled={!!busy} onClick={() => call('dashboard')}>{busy === 'dashboard' ? 'Ouverture…' : 'Ouvrir mon tableau de bord Stripe'}</button>}
      </div>
    </section>
  );
}
