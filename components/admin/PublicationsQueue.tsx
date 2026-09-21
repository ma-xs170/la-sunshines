'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CHECK_LABEL, STATUS_LABEL, type CheckKey, type Checklist, type PubStatus } from '@/lib/organizer/publication';

export interface PubRow { id: string; status: PubStatus; reason: string; created_at: string; reviewed_at: string | null; slug: string; title: string; mode: string; organizer: string; organizer_reference: string | null; organizer_id: string; requester_email: string | null; checklist: Checklist }
const when = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'America/Guadeloupe', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** File d'attente « Publications à valider » : aperçu, validation, refus avec motif obligatoire. */
export default function PublicationsQueue({ rows }: { rows: PubRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');

  async function review(id: string, approve: boolean) {
    setErr('');
    if (!approve && reason.trim().length < 5) { setErr('Le motif du refus est obligatoire (5 caractères minimum).'); return; }
    setBusy(true);
    const r = await fetch(`/api/admin-gestion/publications/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approve, reason: approve ? undefined : reason }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setErr(j.error ?? 'Action impossible.'); return; }
    setOpen(null); setReason(''); router.refresh();
  }

  return (
    <div className="org-table glass"><table><thead><tr><th>Évènement</th><th>Organisation</th><th>Demandé le</th><th>Statut</th><th /></tr></thead>
      <tbody>{rows.map((r) => (
        <Fragment key={r.id}>
          <tr>
            <td data-label="Évènement"><strong>{r.title}</strong><br /><span className="org-muted">{r.slug} · {r.mode === 'bizouk' ? 'Bizouk' : r.mode === 'internal' ? 'Billetterie interne' : 'Sans billetterie'}</span></td>
            <td data-label="Organisation"><a href={`/admin/gestion/organisateurs/${r.organizer_id}`}>{r.organizer}</a><br /><code>{r.organizer_reference ?? ''}</code></td>
            <td data-label="Demandé le">{when(r.created_at)}<br /><span className="org-muted">{r.requester_email ?? ''}</span></td>
            <td data-label="Statut">{STATUS_LABEL[r.status]}{r.status === 'rejected' && r.reason ? <><br /><span className="org-muted">Motif : {r.reason}</span></> : null}</td>
            <td>{r.status === 'pending' && <button type="button" className="btn btn--outline" aria-expanded={open === r.id} onClick={() => { setOpen(open === r.id ? null : r.id); setErr(''); setReason(''); }}>Examiner</button>}</td>
          </tr>
          {open === r.id && (
            <tr><td colSpan={5}>
              <div className="ef-card" style={{ padding: 0 }}>
                <ul className="ef-list" style={{ listStyle: 'none', padding: 0 }}>{(Object.keys(CHECK_LABEL) as CheckKey[]).map((k) => <li key={k}><span>{r.checklist[k] ? '✔' : '✘'} {CHECK_LABEL[k]}</span></li>)}</ul>
                <p><a className="btn btn--outline" href={`/organisateur/evenements/${r.slug}`} target="_blank" rel="noopener noreferrer">Ouvrir l’évènement</a></p>
                <div className="wiz__field"><label htmlFor={`why-${r.id}`}>Motif (obligatoire en cas de refus)</label><textarea id={`why-${r.id}`} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
                {err && <p className="wiz__err" role="alert">{err}</p>}
                <div className="ef-row"><button type="button" className="btn btn--amber" disabled={busy} onClick={() => review(r.id, true)}>Valider et publier</button><button type="button" className="btn btn--outline" disabled={busy} onClick={() => review(r.id, false)}>Refuser</button></div>
              </div>
            </td></tr>
          )}
        </Fragment>
      ))}</tbody></table></div>
  );
}
