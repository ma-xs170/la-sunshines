'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/** Tableau de bord « à la seconde » : interroge les compteurs (léger, sans donnée personnelle) toutes les 2 s
 *  et ne recharge la page que lorsqu'un chiffre a changé. En pause quand l'onglet est masqué, immédiat au retour. */
export default function LiveRefresh({ slug, everyMs = 2000 }: { slug: string; everyMs?: number }) {
  const router = useRouter();
  const last = useRef<string | null>(null);

  useEffect(() => {
    let id: number | undefined;
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const res = await fetch(`/api/organisateur/events/${slug}/live`, { cache: 'no-store' });
        if (!res.ok) return;
        const sig = JSON.stringify(await res.json());
        if (last.current !== null && sig !== last.current) router.refresh();
        last.current = sig;
      } catch { /* réseau indisponible : on réessaie au prochain passage */ } finally { busy = false; }
    };
    const start = () => { if (id === undefined) id = window.setInterval(tick, everyMs); };
    const stop = () => { if (id !== undefined) { window.clearInterval(id); id = undefined; } };
    const onVisible = () => { if (document.visibilityState === 'visible') { tick(); start(); } else stop(); };
    onVisible();
    document.addEventListener('visibilitychange', onVisible);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisible); };
  }, [slug, everyMs, router]);

  return null;
}
