'use client';

import { useState } from 'react';
import { upload } from '@vercel/blob/client';
import { acceptVideoFile, VIDEO_CONFIG } from '@/lib/videoRules';

export interface MediaRow { id: string; status: 'uploaded' | 'processing' | 'ready' | 'failed'; attempts: number; last_error: string; poster_url: string | null; created_at: string }
const LABEL = { uploaded: 'Envoyée', processing: 'En cours de traitement', ready: 'Prête', failed: 'Échec' } as const;

/** Mesure la vidéo dans le navigateur (durée, dimensions) et en tire une image d'aperçu (première image). */
function probe(file: File): Promise<{ width: number; height: number; seconds: number; poster: Blob | null }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const v = document.createElement('video');
    v.preload = 'metadata'; v.muted = true; v.playsInline = true; v.src = url;
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Vidéo illisible dans ce navigateur.')); };
    v.onloadeddata = () => {
      const done = (poster: Blob | null) => { URL.revokeObjectURL(url); resolve({ width: v.videoWidth, height: v.videoHeight, seconds: v.duration, poster }); };
      try { const c = document.createElement('canvas'); const k = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight)); c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
        c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height); c.toBlob((b) => done(b), 'image/jpeg', 0.82); } catch { done(null); }
    };
  });
}

export default function VideoUpload({ slug, media }: { slug: string; media: MediaRow[] }) {
  const [rows, setRows] = useState(media);
  const [pct, setPct] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const handleUploadUrl = `/api/organisateur/events/${slug}/video`;

  async function onFile(f: File | undefined) {
    if (!f) return;
    setMsg('');
    const bad = acceptVideoFile(f.name, f.type, f.size); if (bad) { setMsg(bad); return; }
    try {
      const meta = await probe(f);
      if (meta.seconds > VIDEO_CONFIG.maxSeconds) { setMsg(`Vidéo trop longue (${Math.round(meta.seconds)} s, maximum ${VIDEO_CONFIG.maxSeconds} s).`); return; }
      setPct(0);
      const stamp = Date.now();
      const blob = await upload(`evenements/${slug}/${stamp}-${f.name.replace(/[^A-Za-z0-9._-]/g, '_')}`, f, { access: 'public', handleUploadUrl, multipart: f.size > 20 * 1048576, onUploadProgress: (p) => setPct(Math.round(p.percentage)) });
      const poster = meta.poster ? await upload(`evenements/${slug}/${stamp}-apercu.jpg`, meta.poster, { access: 'public', handleUploadUrl, contentType: 'image/jpeg' }).catch(() => null) : null;
      const res = await fetch(handleUploadUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: blob.url, poster: poster?.url ?? null, width: meta.width, height: meta.height, seconds: meta.seconds, bytes: f.size }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(j.error || 'Enregistrement de la vidéo impossible.'); return; }
      setRows((r) => [{ id: j.id, status: j.status, attempts: 0, last_error: '', poster_url: poster?.url ?? null, created_at: new Date().toISOString() }, ...r]);
      setMsg(j.status === 'ready' ? 'Vidéo prête : elle remplace l’affiche animée sur la fiche publique.' : 'Vidéo envoyée : elle est plus grande que 1080p ou 60 i/s et attend son traitement. L’affiche reste l’image en attendant.');
    } catch (e) { setMsg(e instanceof Error && e.message ? e.message : 'Envoi impossible. Réessaie.'); } finally { setPct(null); }
  }

  return (
    <div className="ef-video">
      <p className="ef-help">Flyer vidéo (mp4, mov ou webm · {Math.round(VIDEO_CONFIG.maxBytes / 1048576)} Mo et {VIDEO_CONFIG.maxSeconds} s maximum). L’affiche image reste utilisée tant que la vidéo n’est pas prête, ainsi que pour les PDF, e-mails et partages. Diffusion plafonnée à 1080p et 60 i/s.</p>
      <label className="btn btn--outline ef-file"><input type="file" accept="video/mp4,video/quicktime,video/webm" disabled={pct !== null} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />Choisir une vidéo</label>
      {pct !== null && <div className="ef-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${pct}%` }} /><em>{pct} %</em></div>}
      {msg && <p className="ef-help" role="status">{msg}</p>}
      {rows.length > 0 && <ul className="ef-media">{rows.map((m) => <li key={m.id}><span className={'ef-pill ef-pill--' + m.status}>{LABEL[m.status]}</span>{m.status === 'failed' && m.last_error && <small> {m.last_error}</small>}</li>)}</ul>}
    </div>
  );
}
