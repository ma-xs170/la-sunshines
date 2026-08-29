'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';

// GA4 chargé UNIQUEMENT après acceptation explicite des cookies (CookieBanner).
// Refus ou absence de réponse => aucun script Google n'est injecté.
const KEY = 'sun_cookie_consent';
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

function hasConsent(): boolean {
  try {
    if (localStorage.getItem(KEY) === 'accepted') return true;
  } catch {
    /* storage indisponible */
  }
  return document.cookie
    .split('; ')
    .some((c) => c === `${KEY}=accepted`);
}

export default function GoogleAnalytics() {
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    if (hasConsent()) setConsented(true);
    const onConsent = (e: Event) => {
      if ((e as CustomEvent).detail === 'accepted') setConsented(true);
    };
    window.addEventListener('sun-consent', onConsent);
    return () => window.removeEventListener('sun-consent', onConsent);
  }, []);

  if (!GA_ID || !consented) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());
gtag('config','${GA_ID}',{anonymize_ip:true});`}
      </Script>
    </>
  );
}
