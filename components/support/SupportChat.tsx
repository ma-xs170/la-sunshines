'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AttachmentPicker, useAttachments, type Attachment } from './Attachments';
import { CATEGORY_LABEL, PRIORITY_LABEL, statusText } from '@/lib/support';

interface Msg { id: number; kind: 'organizer' | 'admin'; internal: boolean; body: string; attachments: Attachment[]; created_at: string; author: string | null }
interface Thread { id: string; reference: string; subject: string; category: string; priority: string; status: 'open' | 'claimed' | 'closed'; closed_note: string; admin_name: string | null; claimed_by: string | null; organizer: { id: string; name: string; reference: string | null } }
interface Data { role: 'admin' | 'org'; thread: Thread; participants: { name: string }[]; messages: Msg[]; events: { kind: string; at: string; meta: Record<string, string> }[] }
const EVENT: Record<string, string> = { created: 'Ticket créé', claimed: 'Pris en charge', transferred: 'Transféré', closed: 'Fermé', reopened: 'Rouvert', participant_added: 'Participant ajouté', priority: 'Priorité modifiée' };
const fmt = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'America/Guadeloupe', dateStyle: 'short', timeStyle: 'short' });

/** Conversation en direct (interrogation toutes les 2 s, en pause onglet masqué). Organisateur ou admin : le rôle vient du serveur, jamais du navigateur. */
export default function SupportChat({ initial, admins, quick }: { initial: Data; admins?: { id: string; name: string }[]; quick?: { id: string; title: string; body: string }[] }) {
  const [d, setD] = useState(initial); const [text, setText] = useState(''); const [internal, setInternal] = useState(false); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [ref, setRef] = useState('');
  const att = useAttachments(); const last = useRef(initial.messages.at(-1)?.id ?? 0); const end = useRef<HTMLDivElement>(null); const id = initial.thread.id;

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`/api/support/threads/${id}?after=${last.current}`, { cache: 'no-store' }); if (!r.ok) return;
      const n: Data = await r.json();
      setD((cur) => ({ ...n, messages: [...cur.messages, ...n.messages.filter((m) => !cur.messages.some((x) => x.id === m.id))] }));
      if (n.messages.length) last.current = Math.max(last.current, ...n.messages.map((m) => m.id));
    } catch { /* réseau : au prochain passage */ }
  }, [id]);
  useEffect(() => {
    let t: number | undefined; const start = () => { if (t === undefined) t = window.setInterval(poll, 2000); }; const stop = () => { if (t !== undefined) { window.clearInterval(t); t = undefined; } };
    const vis = () => (document.visibilityState === 'visible' ? (poll(), start()) : stop()); vis(); document.addEventListener('visibilitychange', vis); return () => { stop(); document.removeEventListener('visibilitychange', vis); };
  }, [poll]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [d.messages.length]);

  async function act(body: Record<string, unknown>) {
    setBusy(true); setErr('');
    const r = await fetch(`/api/support/threads/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setErr(j.error || 'Action impossible.'); return false; } await poll(); return true;
  }
  async function send() { if (await act({ action: 'post', body: text, attachments: att.files, internal })) { setText(''); att.clear(); setInternal(false); } }
  const t = d.thread; const admin = d.role === 'admin'; const closed = t.status === 'closed';

  return (
    <div className="ef">
      <section className="glass ef-card">
        <p className="ef-help"><code>{t.reference}</code> · {CATEGORY_LABEL[t.category]} · priorité {PRIORITY_LABEL[t.priority]?.toLowerCase()}{admin && <> · {t.organizer.name} <code>{t.organizer.reference}</code></>}</p>
        <h2>{t.subject}</h2>
        <p><span className={'ef-pill ef-pill--' + (t.status === 'closed' ? 'failed' : t.status === 'claimed' ? 'processing' : '')}>{statusText(t.status, t.admin_name)}</span>{t.status === 'closed' && t.closed_note && <span className="ef-help"> — {t.closed_note}</span>}</p>
        {d.participants.length > 0 && <p className="ef-help">Participants ajoutés : {d.participants.map((p) => p.name).join(', ')}.</p>}
        {admin && (
          <div className="ef-row">
            {t.status === 'open' && <button className="btn btn--amber" disabled={busy} onClick={() => act({ action: 'claim' })}>Prendre en charge</button>}
            {!closed && admins && admins.length > 0 && t.status === 'claimed' && <select aria-label="Transférer à" defaultValue="" onChange={(e) => { if (e.target.value) void act({ action: 'transfer', to: e.target.value }); e.target.value = ''; }}><option value="">Transférer à…</option>{admins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}
            {!closed && <button className="btn btn--outline" disabled={busy} onClick={() => { const note = window.prompt('Note de fermeture (facultatif)') ; if (note !== null) void act({ action: 'close', note }); }}>Fermer le ticket</button>}
            {closed && <button className="btn btn--outline" disabled={busy} onClick={() => act({ action: 'reopen' })}>Rouvrir</button>}
          </div>)}
      </section>

      <section className="glass ef-card sup-thread" aria-live="polite" aria-label="Conversation">
        {d.messages.map((m) => (
          <div key={m.id} className={'sup-msg sup-msg--' + m.kind + (m.internal ? ' sup-msg--internal' : '')}>
            <p className="sup-msg__meta">{m.kind === 'admin' ? `${m.author ?? 'Équipe'} · LA SUNSHINES` : m.author ?? 'Organisateur'} · {fmt(m.created_at)}{m.internal && ' · note interne (invisible pour l’organisateur)'}</p>
            <p className="sup-msg__body">{m.body}</p>
            {m.attachments.length > 0 && <ul className="sup-msg__att">{m.attachments.map((a) => <li key={a.path}><a href={`/api/support/file?thread=${id}&path=${encodeURIComponent(a.path)}`} target="_blank" rel="noopener noreferrer">{a.name}</a></li>)}</ul>}
          </div>))}
        <div ref={end} />
      </section>

      {closed ? <p className="ef-help">Ce ticket est fermé : la conversation est en lecture seule.</p> : (
        <section className="glass ef-card"><h2>Répondre</h2>
          {admin && quick && quick.length > 0 && <div className="ef-row" role="group" aria-label="Réponses rapides">{quick.map((q) => <button key={q.id} type="button" className="filter" onClick={() => setText((x) => (x ? x + '\n' : '') + q.body)}>{q.title}</button>)}</div>}
          <label className="sr-only" htmlFor="sup-t">Message</label><textarea id="sup-t" rows={4} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)} />
          <AttachmentPicker a={att} />
          {admin && <label className="ef-check"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />Note interne (invisible pour l’organisateur)</label>}
          {err && <p className="ef-err" role="alert">{err}</p>}
          <button className="btn btn--amber" disabled={busy || !text.trim()} onClick={send}>Envoyer</button>
          <div className="ef-field"><label htmlFor="sup-r">Ajouter une organisation à la discussion (référence ORG uniquement)</label>
            <div className="ef-row"><input id="sup-r" value={ref} placeholder="ORG.20374728" onChange={(e) => setRef(e.target.value.toUpperCase())} /><button className="btn btn--outline" disabled={busy || !ref} onClick={async () => { if (await act({ action: 'add', ref })) setRef(''); }}>Ajouter</button></div>
            <p className="ef-help">Seuls les participants voient ce ticket. Seul le nom de la structure est révélé après l’ajout.</p></div>
        </section>)}

      <section className="glass ef-card"><h2>Historique</h2><ul className="ef-list">{d.events.map((e, i) => <li key={i}><span>{EVENT[e.kind] ?? e.kind}{e.meta?.to ? ` : ${e.meta.to}` : ''}{e.meta?.organization ? ` : ${e.meta.organization}` : ''}</span><span className="ef-help">{fmt(e.at)}</span></li>)}</ul></section>
    </div>
  );
}
