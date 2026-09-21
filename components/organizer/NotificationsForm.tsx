'use client';

import { useState } from 'react';

const KINDS: [string, string, string][] = [
  ['daily_sales', 'Ventes du jour', 'Un résumé chaque matin.'], ['support_message', 'Nouveau message du support', 'Quand l’équipe te répond.'],
  ['low_stock', 'Stock bas', 'Quand un tarif approche de l’épuisement.'], ['refund', 'Remboursement', 'Quand un remboursement est traité.'], ['send_error', 'Erreur d’envoi', 'Quand un e-mail de billets n’a pas pu partir.'],
];

/** Préférences personnelles de notification par e-mail (chacun règle les siennes). L'envoi automatique sera activé avec la mise en vente : les choix sont déjà enregistrés. */
export default function NotificationsForm({ org, initial, editable }: { org: string; initial: Record<string, boolean>; editable: boolean }) {
  const [v, setV] = useState(initial); const [err, setErr] = useState('');
  async function toggle(kind: string, email: boolean) {
    setErr(''); const prev = v; setV({ ...v, [kind]: email });
    const r = await fetch('/api/organisateur/notifications', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ org, kind, email }) });
    if (!r.ok) { setV(prev); setErr('Enregistrement impossible.'); }
  }
  return (
    <div className="ef"><section className="glass ef-card"><h2>Recevoir un e-mail pour…</h2>
      <ul className="ef-list">{KINDS.map(([k, l, d]) => (
        <li key={k}><div><strong>{l}</strong><span className="ef-help"> {d}</span></div>
          <label className="ef-check"><input type="checkbox" disabled={!editable} checked={v[k] !== false} onChange={(e) => toggle(k, e.target.checked)} />E-mail</label></li>))}</ul>
      {!editable && <p className="ef-help">Le compte administrateur n’a pas de préférences d’équipe.</p>}
      {err && <p className="ef-err" role="alert">{err}</p>}
      <p className="ef-help">Ces préférences sont enregistrées ; l’envoi automatique de ces e-mails sera activé avec l’ouverture de la vente.</p></section></div>
  );
}
