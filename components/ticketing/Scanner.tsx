'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface EventOpt { id: string; name: string; startsAt: string }
type Kind = 'valid' | 'already_used' | 'invalid' | 'wrong_event' | 'cancelled';
interface Result { kind: Kind; holder?: string | null; tier?: string | null; usedAt?: string | null }

const TIME = new Intl.DateTimeFormat('fr-FR', { timeZone: 'America/Guadeloupe', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const LABEL: Record<Kind, { title: string; sub?: string }> = {
  valid: { title: 'VALIDE' },
  already_used: { title: 'DÉJÀ SCANNÉ' },
  invalid: { title: 'INVALIDE', sub: 'Code inconnu ou falsifié' },
  wrong_event: { title: 'AUTRE ÉVÉNEMENT', sub: 'Ce billet n’est pas pour cette soirée' },
  cancelled: { title: 'BILLET ANNULÉ', sub: 'Annulé ou remboursé' },
};

// Scan à l'entrée : caméra (qr-scanner) + saisie manuelle de secours + compteur en direct.
// Résultat plein écran : VALIDE (vert), DÉJÀ SCANNÉ avec l'heure du 1er scan / INVALIDE (rouge).
export default function Scanner({ events }: { events: EventOpt[] }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? '');
  const [result, setResult] = useState<Result | null>(null);
  const [stats, setStats] = useState<{ entered: number; sold: number } | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<{ start: () => Promise<void>; pause: () => void; destroy: () => void } | null>(null);
  const lock = useRef({ code: '', at: 0, busy: false });
  const eventRef = useRef(eventId);
  eventRef.current = eventId;

  const refreshStats = useCallback(async () => {
    if (!eventRef.current) return;
    try {
      const r = await fetch(`/api/scan/stats?event_id=${eventRef.current}`, { cache: 'no-store' });
      if (r.ok) setStats(await r.json());
    } catch { /* garde l'ancien compteur */ }
  }, []);

  useEffect(() => {
    refreshStats();
    const id = window.setInterval(refreshStats, 5000);
    return () => window.clearInterval(id);
  }, [eventId, refreshStats]);

  const submit = useCallback(async (code: string) => {
    const now = Date.now();
    if (lock.current.busy || (code === lock.current.code && now - lock.current.at < 3000)) return;   // même code re-lu en boucle
    lock.current = { code, at: now, busy: true };
    setBusy(true);
    try {
      const res = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, event_id: eventRef.current }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ kind: 'invalid', holder: null });
        setCameraError(data.error ?? 'Erreur de scan');
      } else {
        setCameraError('');
        setResult({ kind: data.result as Kind, holder: data.holder, tier: data.tier, usedAt: data.used_at });
      }
      navigator.vibrate?.(data.result === 'valid' ? 80 : [200, 80, 200]);
      refreshStats();
    } catch {
      setResult({ kind: 'invalid' });
      setCameraError('Réseau indisponible : le scan n’a pas été enregistré.');
    } finally {
      lock.current.busy = false;
      setBusy(false);
    }
  }, [refreshStats]);

  // caméra
  useEffect(() => {
    let dead = false;
    (async () => {
      const el = videoRef.current;
      if (!el) return;
      try {
        const QrScanner = (await import('qr-scanner')).default;
        if (dead) return;
        const s = new QrScanner(el, (r) => submit(r.data), { preferredCamera: 'environment', maxScansPerSecond: 8, highlightScanRegion: true, returnDetailedScanResult: true });
        scannerRef.current = s;
        await s.start();
      } catch {
        if (!dead) setCameraError('Caméra indisponible (autorisation refusée ou HTTPS requis). Utilise la saisie manuelle.');
      }
    })();
    return () => { dead = true; scannerRef.current?.destroy(); scannerRef.current = null; };
  }, [submit]);

  // fermeture automatique : vert après 1,8 s ; les erreurs restent jusqu'au toucher (ou 6 s)
  useEffect(() => {
    if (!result) return;
    const id = window.setTimeout(() => setResult(null), result.kind === 'valid' ? 1800 : 6000);
    return () => window.clearTimeout(id);
  }, [result]);

  if (events.length === 0) return <p className="admin-hint">Aucun événement publié en billetterie.</p>;
  const ok = result?.kind === 'valid';

  return (
    <div className="scan">
      <div className="scan__bar">
        <select value={eventId} onChange={(e) => setEventId(e.target.value)} aria-label="Événement">
          {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <p className="scan__count" aria-live="polite">
          <strong>{stats ? stats.entered : '–'}</strong> / {stats ? stats.sold : '–'} <span>entrés</span>
        </p>
      </div>

      <video ref={videoRef} className="scan__video" muted playsInline />
      {cameraError && <p className="admin-error" role="alert">{cameraError}</p>}

      <form className="scan__manual" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { submit(manual.trim()); setManual(''); } }}>
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Code du billet (saisie manuelle)" autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-label="Code du billet" />
        <button className="btn btn--amber" disabled={busy || !manual.trim()}>Valider</button>
      </form>

      {result && (
        <button type="button" className={`scan__overlay ${ok ? 'is-ok' : 'is-ko'}`} onClick={() => setResult(null)} aria-live="assertive">
          <span className="scan__icon" aria-hidden="true">{ok ? '✓' : '✕'}</span>
          <span className="scan__title">{LABEL[result.kind].title}</span>
          {LABEL[result.kind].sub && <span className="scan__sub">{LABEL[result.kind].sub}</span>}
          {result.holder && <span className="scan__who">{result.holder}</span>}
          {result.tier && <span className="scan__sub">{result.tier}</span>}
          {result.kind === 'already_used' && result.usedAt && <span className="scan__sub">Premier scan à {TIME.format(new Date(result.usedAt))}</span>}
          <span className="scan__tap">Toucher pour continuer</span>
        </button>
      )}
    </div>
  );
}
