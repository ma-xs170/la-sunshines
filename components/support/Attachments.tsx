'use client';

import { useState } from 'react';
import { ATTACH_MAX } from '@/lib/support';

export interface Attachment { path: string; name: string; size: number; type: string }

/** Sélecteur de pièces jointes (images, PDF, 10 Mo) : envoi immédiat vers le stockage privé. */
export function useAttachments() {
  const [files, setFiles] = useState<Attachment[]>([]); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function add(list: FileList | null) {
    if (!list) return; setErr('');
    for (const f of Array.from(list)) {
      if (files.length >= ATTACH_MAX) { setErr(`${ATTACH_MAX} pièces jointes maximum.`); break; }
      setBusy(true); const fd = new FormData(); fd.append('file', f);
      const r = await fetch('/api/support/upload', { method: 'POST', body: fd }); const j = await r.json().catch(() => ({})); setBusy(false);
      if (!r.ok) { setErr(j.error || 'Envoi impossible.'); continue; }
      setFiles((cur) => [...cur, j]);
    }
  }
  return { files, busy, err, add, clear: () => setFiles([]), remove: (p: string) => setFiles((c) => c.filter((x) => x.path !== p)) };
}

export function AttachmentPicker({ a }: { a: ReturnType<typeof useAttachments> }) {
  return (
    <div className="sup-att">
      <label className="btn btn--outline ef-file"><input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" disabled={a.busy} onChange={(e) => { void a.add(e.target.files); e.target.value = ''; }} />{a.busy ? 'Envoi…' : 'Ajouter une pièce jointe'}</label>
      <span className="ef-help"> Images ou PDF, 10 Mo maximum chacune.</span>
      {a.files.length > 0 && <ul className="ef-list">{a.files.map((f) => <li key={f.path}><span>{f.name}</span><button type="button" className="ef-link" onClick={() => a.remove(f.path)}>Retirer</button></li>)}</ul>}
      {a.err && <p className="ef-err" role="alert">{a.err}</p>}
    </div>
  );
}
