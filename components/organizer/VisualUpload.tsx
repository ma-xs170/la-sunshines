'use client';

import Link from 'next/link';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';
import './wizard.css';

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Visuel (flyer) de l'évènement : envoi direct vers le stockage public, puis enregistrement côté serveur. */
export default function VisualUpload({ slug, current, title }: { slug: string; current: string | null; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const api = `/api/organisateur/events/${slug}/visuel`;

  async function onFile(f: File | undefined) {
    if (!f) return; setErr(''); setMsg('');
    if (!TYPES.includes(f.type) || f.size > 8 * 1024 * 1024) { setErr('Choisis une image JPEG, PNG ou WebP de 8 Mo maximum.'); return; }
    setBusy(true);
    try {
      const ext = f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg';
      const blob = await upload(`evenements/${slug}/flyer.${ext}`, f, { access: 'public', handleUploadUrl: api });
      const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: blob.url }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? 'Enregistrement impossible.');
      setMsg('Visuel enregistré.'); router.refresh();
    } catch (e) { setErr(e instanceof Error && e.message ? e.message : 'Envoi impossible. Réessaie.'); }
    setBusy(false);
  }
  async function remove() {
    setBusy(true); setErr(''); setMsg('');
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ remove: true }) });
    setBusy(false);
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).error ?? 'Retrait impossible.'); return; }
    setMsg('Visuel retiré.'); router.refresh();
  }
  return (
    <div className="wiz">
      <section className="wiz__card glass">
        <h2>Visuel de « {title} »</h2>
        <p className="wiz__lead">L’affiche affichée sur la page publique de l’évènement. Format vertical recommandé (4:5 ou 9:16), JPEG, PNG ou WebP, 8 Mo maximum.</p>
        {current && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt={`Visuel de ${title}`} style={{ maxWidth: 320, width: '100%', borderRadius: 12, border: '1px solid var(--panel-border)' }} />
        )}
        <div className="wiz__field">
          <label htmlFor="visuel">{current ? 'Remplacer le visuel' : 'Ajouter un visuel'}</label>
          <div className="wiz__file"><input id="visuel" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />{busy && <span role="status">Envoi en cours…</span>}</div>
        </div>
        {err && <p className="wiz__err" role="alert">{err}</p>}
        {msg && <p className="wiz__hint" role="status">{msg}</p>}
        <div className="wiz__nav"><Link className="btn btn--outline" href={`/organisateur/evenements/${slug}`}>← Retour à l’évènement</Link>{current && <button type="button" className="btn btn--outline" disabled={busy} onClick={remove}>Retirer le visuel</button>}</div>
      </section>
    </div>
  );
}
