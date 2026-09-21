'use client';

import { useEffect } from 'react';

/** Compte une vue de la page évènement (anonyme, agrégée : jour, canal, pays). Une seule fois par onglet et par évènement ; respecte « Ne pas me suivre ». */
export default function ViewBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    try {
      if (navigator.doNotTrack === '1') return;
      const key = `sun-view:${slug}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
      const body = JSON.stringify({ slug, ref: document.referrer });
      if (!navigator.sendBeacon?.('/api/track/view', new Blob([body], { type: 'application/json' }))) fetch('/api/track/view', { method: 'POST', body, keepalive: true }).catch(() => undefined);
    } catch { /* stockage ou réseau indisponible : la mesure est facultative */ }
  }, [slug]);
  return null;
}
