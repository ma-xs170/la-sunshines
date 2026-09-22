'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { REASON_LABEL, type CancellationState } from '@/lib/organizer/cancellation';
import { formatEuro, formatGp } from '@/lib/ticketing/time';

const MSG_STATUS: Record<string, string> = { sending: 'Envoi en cours…', sent: 'Envoyé à tous les destinataires', partial: 'Envoyé partiellement', failed: 'Échec de l’envoi' };

/** Suivi d'une annulation déjà décidée : raison, remboursements restants, avancement du message. Tout est rejouable
 *  (bouton « Relancer ») si un remboursement ou un envoi a échoué — jamais besoin de recommencer l'annulation. */
export default function CancelStatus({ slug, state }: { slug: string; state: CancellationState }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function retry() {
    setBusy(true); setMsg('');
    const r = await fetch(`/api/organisateur/events/${slug}/cancellation/relancer`, { method: 'POST' });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setMsg(j.error ?? 'Reprise impossible.'); return; }
    setMsg(`Remboursements relancés : ${j.refunded} réussi(s)${j.refund_failed ? `, ${j.refund_failed} encore en échec` : ''}.`);
    router.refresh();
  }

  const needsRetry = state.refund_remaining.length > 0 || (state.message?.failed_count ?? 0) > 0;

  return (
    <div className="ef">
      <section className="glass ef-card"><h2>✔ Évènement annulé</h2>
        <ul className="ef-list">
          <li><span>Raison</span><strong>{REASON_LABEL[state.reason]}{state.reason_detail ? ` — ${state.reason_detail}` : ''}</strong></li>
          <li><span>Décidé le</span><strong>{formatGp(state.created_at)}</strong></li>
          <li><span>Billets annulés</span><strong>{state.tickets_cancelled}</strong></li>
          {state.replacement && <li><span>Remplacé par</span><strong><a href={`/organisateur/evenements/${state.replacement.slug}`}>{state.replacement.title}</a> — {formatGp(state.replacement.starts_at)}</strong></li>}
        </ul>
      </section>

      <section className="glass ef-card"><h2>Remboursements</h2>
        <p>Remboursé jusqu’ici : <strong>{formatEuro(state.refunded_cents)}</strong> sur {formatEuro(state.refund_cents_planned)} prévus.</p>
        {state.refund_remaining.length > 0 ? (
          <div className="org-table glass"><table><thead><tr><th>Commande</th><th>Reste à rembourser</th></tr></thead>
            <tbody>{state.refund_remaining.map((o) => <tr key={o.id}><td data-label="Commande"><code>{o.number}</code></td><td data-label="Reste">{formatEuro(o.remaining_cents)}</td></tr>)}</tbody></table></div>
        ) : <p className="org-muted">Tout est remboursé.</p>}
      </section>

      {state.message && (
        <section className="glass ef-card"><h2>Message aux participants</h2>
          <ul className="ef-list">
            <li><span>Objet</span><strong>{state.message.subject}</strong></li>
            <li><span>Statut</span><strong>{MSG_STATUS[state.message.status] ?? state.message.status}</strong></li>
            <li><span>Destinataires</span><strong>{state.message.sent_count} envoyé(s) / {state.message.recipient_count}{state.message.failed_count ? ` · ${state.message.failed_count} en échec` : ''}</strong></li>
            {state.message.last_error && <li><span>Dernière erreur</span><strong>{state.message.last_error}</strong></li>}
          </ul>
        </section>
      )}

      {needsRetry && (
        <section className="glass ef-card">
          <p className="ef-help">Un remboursement ou un envoi n’a pas abouti : relance-le, c’est sans risque de doublon.</p>
          <button type="button" className="btn btn--amber" disabled={busy} onClick={retry}>{busy ? 'Reprise…' : 'Relancer les remboursements et l’envoi'}</button>
          {msg && <p role="status" style={{ marginTop: 10 }}>{msg}</p>}
        </section>
      )}
    </div>
  );
}
