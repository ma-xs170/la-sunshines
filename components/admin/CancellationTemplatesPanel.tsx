'use client';

import { useState } from 'react';
import { REASON_LABEL, type ReasonCode } from '@/lib/organizer/cancellation';

export interface TemplateRow { reason: ReasonCode; subject: string; body: string; updated_at: string; org_overrides: number }

/** Modèles d'excuse PAR DÉFAUT du site (un par raison) : pris automatiquement quand l'organisation n'a pas sa propre
 *  version. Édités ici, sans redéploiement ; les organisations avec une surcharge propre ne sont pas affectées. */
export default function CancellationTemplatesPanel({ initial }: { initial: TemplateRow[] }) {
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState<ReasonCode | null>(null);
  const [draft, setDraft] = useState({ subject: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  function edit(r: TemplateRow) { setOpen(r.reason); setDraft({ subject: r.subject, body: r.body }); setMsg(''); }

  async function save(reason: ReasonCode) {
    setBusy(true); setMsg('');
    const r = await fetch('/api/admin-gestion/cancellation-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason, ...draft }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setMsg(j.error ?? 'Enregistrement impossible.'); return; }
    setRows((x) => x.map((row) => (row.reason === reason ? { ...row, subject: draft.subject, body: draft.body, updated_at: new Date().toISOString() } : row)));
    setOpen(null);
  }

  return (
    <div className="ef">
      {rows.map((r) => (
        <section key={r.reason} className="glass ef-card">
          <h2>{REASON_LABEL[r.reason]}</h2>
          {open === r.reason ? (
            <>
              <div className="wiz__field"><label htmlFor={`ct-s-${r.reason}`}>Objet</label>
                <input id={`ct-s-${r.reason}`} value={draft.subject} maxLength={120} onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))} /></div>
              <div className="wiz__field"><label htmlFor={`ct-b-${r.reason}`}>Message ({'{evenement}'} {'{date}'} {'{lieu}'} {'{organisateur}'} sont remplacés automatiquement)</label>
                <textarea id={`ct-b-${r.reason}`} rows={10} maxLength={1800} value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} /></div>
              <div className="ef-row">
                <button type="button" className="btn btn--amber" disabled={busy} onClick={() => save(r.reason)}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
                <button type="button" className="btn btn--outline" disabled={busy} onClick={() => setOpen(null)}>Annuler</button>
              </div>
            </>
          ) : (
            <>
              <p><strong>{r.subject}</strong></p>
              <p style={{ whiteSpace: 'pre-line', color: 'var(--gray)' }}>{r.body}</p>
              <p className="ef-help">{r.org_overrides > 0 ? `${r.org_overrides} organisation(s) utilisent leur propre version pour cette raison.` : 'Aucune organisation n’a de version propre pour cette raison.'}</p>
              <button type="button" className="btn btn--outline" onClick={() => edit(r)}>Modifier</button>
            </>
          )}
        </section>
      ))}
      {msg && <p className="ef-err" role="alert">{msg}</p>}
    </div>
  );
}
