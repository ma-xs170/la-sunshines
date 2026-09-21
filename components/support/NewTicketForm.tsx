'use client';

import { useState } from 'react';
import { AttachmentPicker, useAttachments } from './Attachments';
import { CATEGORIES, PRIORITIES } from '@/lib/support';

/** Créer un ticket : objet, catégorie, priorité, description, pièces jointes. Pré-rempli avec la page d'origine et la référence ORG (bouton d'aide). */
export default function NewTicketForm({ org, reference, page }: { org: string; reference: string | null; page: string }) {
  const att = useAttachments();
  const [f, setF] = useState({ subject: '', category: '', priority: 'medium', body: page ? `Page concernée : ${page}\n\n` : '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await fetch('/api/support/threads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ org, ...f, attachments: att.files, context: { page: page || undefined, reference: reference || undefined } }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setErr(j.error || 'Envoi impossible.'); return; }
    window.location.assign(`/organisateur/support/${j.id}`);
  }
  return (
    <form className="ef" onSubmit={submit} noValidate>
      <section className="glass ef-card"><h2>Ta demande</h2>
        {reference && <p className="ef-help">Ta référence <code>{reference}</code> est jointe automatiquement.</p>}
        <div className="ef-grid">
          <div className="ef-field"><label htmlFor="n-s">Objet</label><input id="n-s" value={f.subject} maxLength={140} onChange={(e) => setF({ ...f, subject: e.target.value })} /></div>
          <div className="ef-field"><label htmlFor="n-c">Catégorie</label><select id="n-c" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">Choisir…</option>{CATEGORIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="ef-field"><label htmlFor="n-p">Priorité</label><select id="n-p" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{PRIORITIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        </div>
        <div className="ef-field"><label htmlFor="n-b">Description</label><textarea id="n-b" rows={8} maxLength={5000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
        <AttachmentPicker a={att} />
        {err && <p className="ef-err" role="alert">{err}</p>}
        <button className="btn btn--amber" disabled={busy || !f.subject || !f.category || !f.body.trim()}>{busy ? 'Envoi…' : 'Soumettre'}</button>
      </section>
    </form>
  );
}
