import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import Sprite from '@/components/Sprite';
import SiteEffects from '@/components/SiteEffects';
import CookieBanner from '@/components/CookieBanner';
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
  icons: { icon: '/favicon.svg' },
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
      </body>
    </html>
  );
}
