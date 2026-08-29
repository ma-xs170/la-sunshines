import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import Sprite from '@/components/Sprite';
import SiteEffects from '@/components/SiteEffects';
import CookieBanner from '@/components/CookieBanner';
import GoogleAnalytics from '@/components/GoogleAnalytics';
import AnnouncementBar from '@/components/AnnouncementBar';
import Assistant from '@/components/Assistant';
import { getActiveAnnouncement } from '@/lib/content';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || 'https://la-sunshines.vercel.app',
  ),
  title: 'LA SUNSHINES · Soirées 12–17 ans en Guadeloupe',
  description:
    'LA SUNSHINES, la soirée référence des 12–17 ans en Guadeloupe : billetterie sécurisée, entrée contrôlée, staff et sécurité dédiés. Prochaine édition « La Nuit Des Ombres » le 17 octobre en Guadeloupe.',
  // Favicon = monogramme du logo « La Sunshines » (fichiers dans /public).
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: { url: '/apple-icon.png', sizes: '180x180' },
  },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    title: 'LA SUNSHINES · Soirées 12–17 ans en Guadeloupe',
    description:
      'La soirée référence des ados en Guadeloupe. Sécurisée, encadrée, et toujours la meilleure ambiance. Prochaine édition le 17 octobre.',
  },
};

export const viewport: Viewport = {
  themeColor: '#FFF8EE',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const announcement = getActiveAnnouncement();
  return (
    <html lang="fr" className="no-js" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Inter:wght@400;500;600;700&family=Unbounded:wght@600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.replace('no-js','js')",
          }}
        />

        <div className="glow" aria-hidden="true">
          <span className="g1" />
          <span className="g2" />
        </div>

        <Sprite />
        {announcement && (
          <AnnouncementBar
            id={announcement.id}
            text={announcement.text}
            href={announcement.href || undefined}
          />
        )}
        {children}
        <CookieBanner />
        <Assistant />
        <SiteEffects />

        {/* Mesure d'audience : Vercel (sans cookie) toujours actif ;
            GA4 uniquement après acceptation via le CookieBanner. */}
        <Analytics />
        <SpeedInsights />
        <GoogleAnalytics />
      </body>
    </html>
  );
}
