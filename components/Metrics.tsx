'use client';

import { usePathname } from 'next/navigation';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import GoogleAnalytics from './GoogleAnalytics';

// Mesure d'audience : Vercel (sans cookie) toujours actif ; GA4 uniquement après acceptation via le CookieBanner.
// L'espace /admin n'envoie AUCUNE mesure (les URL de la page Clients portent la recherche : nom, e-mail, téléphone) : évènements Vercel écartés, GA4 non monté.
const isAdminUrl = (u: string) => { try { const p = new URL(u, 'https://x.invalid').pathname; return p === '/admin' || p.startsWith('/admin/') || p.startsWith('/api/admin'); } catch { return false; } };

export default function Metrics() {
  const pathname = usePathname() ?? '';
  return (
    <>
      <Analytics beforeSend={(e) => (isAdminUrl(e.url) ? null : e)} />
      <SpeedInsights beforeSend={(e) => (isAdminUrl(e.url) ? null : e)} />
      {!isAdminUrl(pathname) && <GoogleAnalytics />}
    </>
  );
}
