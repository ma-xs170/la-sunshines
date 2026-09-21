'use client';

import { useEffect, useState } from 'react';

/** « Suivre » : compte client requis. Les e-mails de nouveaux évènements sont un opt-in explicite, désactivable en un clic. */
export default function FollowButton({ slug }: { slug: string }) {
  const [st, setSt] = useState<{ following: boolean; notify: boolean; auth: boolean } | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { fetch(`/api/organisateurs/${slug}/suivre`, { cache: 'no-store' }).then((r) => r.json()).then(setSt).catch(() => setSt({ following: false, notify: false, auth: false })); }, [slug]);
  async function set(method: 'POST' | 'DELETE', notify = false) {
    setBusy(true); const r = await fetch(`/api/organisateurs/${slug}/suivre`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify({ notify }) : undefined });
    setBusy(false); if (r.status === 401) { window.location.assign(`/connexion?next=${encodeURIComponent(window.location.pathname)}`); return; }
    if (r.ok) setSt(method === 'POST' ? { following: true, notify, auth: true } : { following: false, notify: false, auth: true });
  }
  if (!st) return <button className="btn btn--outline" disabled>Suivre</button>;
  return (
    <div className="follow">
      {st.following ? <button className="btn btn--outline" disabled={busy} onClick={() => set('DELETE')} aria-pressed="true">Suivi ✓</button> : <button className="btn btn--amber" disabled={busy} onClick={() => set('POST', false)}>Suivre</button>}
      {st.following && <label className="ef-check"><input type="checkbox" checked={st.notify} disabled={busy} onChange={(e) => set('POST', e.target.checked)} />Recevoir un e-mail pour ses nouveaux évènements</label>}
    </div>
  );
}
