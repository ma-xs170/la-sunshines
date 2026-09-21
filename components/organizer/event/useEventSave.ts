'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Enregistrement d'une section : état modifié / envoi / erreur, alerte en quittant avec des modifications, brouillon local automatique. */
export function useEventSave<T extends Record<string, unknown>>(slug: string, section: string, initial: T) {
  const key = `sun_orga_draft:${slug}:${section}`;
  const [value, setValue] = useState<T>(initial);
  const [saved, setSaved] = useState<T>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [restored, setRestored] = useState(false);
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  const first = useRef(true);

  useEffect(() => {   // brouillon local : proposé une fois au chargement
    try { const d = localStorage.getItem(key); if (d && d !== JSON.stringify(initial)) { setValue(JSON.parse(d) as T); setRestored(true); } } catch { /* stockage indisponible */ }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    try { if (dirty) localStorage.setItem(key, JSON.stringify(value)); else localStorage.removeItem(key); } catch { /* ignore */ }
  }, [value, dirty, key]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const save = useCallback(async (patch: Record<string, unknown>) => {
    setBusy(true); setError(''); setDone(false);
    try {
      const res = await fetch(`/api/organisateur/events/${slug}/details`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || 'Enregistrement impossible. Réessaie.'); return false; }
      setSaved(value); setDone(true); try { localStorage.removeItem(key); } catch { /* ignore */ }
      return true;
    } catch { setError('Connexion impossible. Tes modifications sont gardées sur cet appareil.'); return false; } finally { setBusy(false); }
  }, [slug, value, key]);

  const discard = () => { setValue(saved); try { localStorage.removeItem(key); } catch { /* ignore */ } setRestored(false); };
  return { value, setValue, dirty, busy, error, done, save, restored, discard };
}
