'use client';

import { useState } from 'react';
import type { TicketingSettings } from '@/lib/ticketing/settings';

async function patch(key: string, value: unknown): Promise<string | null> {
  const res = await fetch('/api/billetterie/admin/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
  if (res.ok) return null;
  return (await res.json().catch(() => ({}))).error ?? 'Enregistrement impossible.';
}

// Flag global Bizouk ⇄ billetterie interne + frais de service. Effet immédiat, sans redéployer.
export default function AdminSettingsForm({ initial }: { initial: TicketingSettings }) {
  const [mode, setMode] = useState(initial.dbMode); // réglage RÉEL en base (jamais le mode forcé par l'environnement)
  const [pct, setPct] = useState(String(initial.feePercent));
  const [fix, setFix] = useState(String(initial.feeFixedCents / 100));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function switchMode(next: 'bizouk' | 'native') {
    if (next === mode) return;
    if (next === 'native') {
      // Ce réglage est PARTAGÉ avec la production : il ouvre les ventes au PUBLIC. Pour tester, utilise plutôt
      // TICKETING_FORCE_MODE (local / Preview) et le bouton « Activer et publier pour le test » de l'événement.
      const typed = window.prompt('ATTENTION : ce bouton OUVRE LES VENTES AU PUBLIC, aussi en production (réglage partagé). Pour tester seulement, n’utilise pas ce bouton.\n\nPour ouvrir les ventes au public, tape OUVRIR :');
      if (typed?.trim() !== 'OUVRIR') return;
    }
    setBusy(true);
    const err = await patch('ticketing_mode', next);
    setBusy(false);
    if (err) return setMsg(err);
    setMode(next);
    setMsg(next === 'native' ? 'Billetterie interne activée.' : 'Retour à Bizouk.');
  }

  async function saveFees(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const p = Number(pct.replace(',', '.'));
    const f = Math.round(Number(fix.replace(',', '.')) * 100);
    if (!Number.isFinite(p) || !Number.isFinite(f)) {
      setBusy(false);
      return setMsg('Valeurs de frais invalides.');
    }
    const err = (await patch('fee_percent', p)) ?? (await patch('fee_fixed_cents', f));
    setBusy(false);
    setMsg(err ?? 'Frais enregistrés.');
  }

  return (
    <div className="admin-panel glass">
      <h2>Mode de billetterie</h2>
      {mode === 'native' && (
        <p className="admin-error" role="alert" style={{ marginBottom: 12 }}>
          ⚠ Les ventes sont OUVERTES AU PUBLIC (mode réel = billetterie interne, partagé avec la production). Les pages /cgv et /remboursement sont visibles.
        </p>
      )}
      {initial.forced && (
        <p className="admin-note" role="status">
          <strong>Mode de test forcé sur cet environnement</strong> (<code>TICKETING_FORCE_MODE=internal</code>) : la
          billetterie interne est active ICI seulement (local / Preview). Le réglage ci-dessous est le réglage réel, partagé
          avec la production, et n’est pas modifié par ce forçage.
        </p>
      )}
      <p className="admin-hint">
        <strong>Bizouk</strong> (défaut) : les pages événement affichent le widget Bizouk, la billetterie interne est
        invisible. <strong>Interne</strong> : les événements dont la billetterie est activée affichent les tarifs
        ci-dessous. Bascule immédiate, sans redéploiement.
      </p>
      <div className="admin-form__actions">
        <button type="button" className={'btn ' + (mode === 'bizouk' ? 'btn--amber' : 'btn--outline')} disabled={busy} onClick={() => switchMode('bizouk')}>
          Bizouk {mode === 'bizouk' && '✓'}
        </button>
        <button type="button" className={'btn ' + (mode === 'native' ? 'btn--amber' : 'btn--outline')} disabled={busy} onClick={() => switchMode('native')}>
          Billetterie interne {mode === 'native' && '✓'}
        </button>
      </div>

      <form onSubmit={saveFees} className="tb-grid" style={{ marginTop: 24 }}>
        <label className="admin-field"><span>Frais de service (%)</span>
          <input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />
        </label>
        <label className="admin-field"><span>Frais fixes par commande (€)</span>
          <input inputMode="decimal" value={fix} onChange={(e) => setFix(e.target.value)} />
        </label>
        <div className="admin-form__actions"><button className="btn btn--outline" disabled={busy}>Enregistrer les frais</button></div>
      </form>
      <p className="admin-hint">Frais ajoutés au total de l’acheteur, affichés avant paiement. 0 par défaut.</p>
      {msg && <p className="admin-note" role="status">{msg}</p>}
    </div>
  );
}
