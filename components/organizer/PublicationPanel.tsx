'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CHECK_LABEL, STATUS_LABEL, checkHref, type CheckKey, type Checklist, type PubStatus } from '@/lib/organizer/publication';
import './wizard.css';

export interface PubState { checklist: Checklist; ready: boolean; event_status: string; mode: 'internal' | 'bizouk' | 'none'; org_approved: boolean; request: { id: string; status: PubStatus; reason: string; created_at: string } | null }

/** « Demander la publication » : ce qui manque, état de la demande, motif d'un refus. */
export default function PublicationPanel({ slug, state }: { slug: string; state: PubState }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const pending = state.request?.status === 'pending';
  const published = state.event_status === 'published';

  async function act(action: 'request' | 'cancel') {
    setBusy(true); setErr('');
    const r = await fetch(`/api/organisateur/events/${slug}/publication`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setErr(j.error ?? 'Action impossible.'); return; }
    router.refresh();
  }

  return (
    <section className="glass org-panel" aria-labelledby="pub-h">
      <h2 id="pub-h">Publication</h2>
      {published ? <p role="status">✔ {STATUS_LABEL.approved} : la page de l’évènement est en ligne (<a href={`/editions/${slug}`}>voir la page</a>).</p> : (
        <>
          <ul className="ef-list" style={{ listStyle: 'none', padding: 0 }}>
            {(Object.keys(CHECK_LABEL) as CheckKey[]).map((k) => (
              <li key={k}><span>{state.checklist[k] ? '✔' : '○'} {CHECK_LABEL[k]}</span>{state.checklist[k] ? <span className="org-muted">Fait</span> : <a href={checkHref(k, slug, state.mode)}>Compléter</a>}</li>
            ))}
          </ul>
          {!state.org_approved && <p className="ef-warn">L’organisation doit être approuvée avant de demander une publication.</p>}
          {state.request?.status === 'rejected' && <p className="ef-warn" role="status"><strong>Demande refusée.</strong> Motif : {state.request.reason}</p>}
          {pending ? (
            <div className="ef-row"><span role="status">⏳ {STATUS_LABEL.pending}. Un administrateur va l’examiner.</span><button type="button" className="btn btn--outline" disabled={busy} onClick={() => act('cancel')}>Annuler la demande</button></div>
          ) : (
            <div className="ef-row"><button type="button" className="btn btn--amber" disabled={busy || !state.ready || !state.org_approved} onClick={() => act('request')}>{busy ? 'Envoi…' : 'Demander la publication'}</button>{!state.ready && <span className="org-muted">Complète d’abord la checklist.</span>}</div>
          )}
          {err && <p className="wiz__err" role="alert">{err}</p>}
        </>
      )}
    </section>
  );
}
