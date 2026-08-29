'use client';

import { useEffect, useState } from 'react';

// Phase 5 — bandeau RGPD. Choix mémorisé 6 mois dans un cookie (+ miroir
// localStorage pour lecture immédiate sans parser document.cookie).
const KEY = 'sun_cookie_consent';
const SIX_MONTHS = 60 * 60 * 24 * 180; // secondes

function alreadyDecided(): boolean {
  try {
    if (localStorage.getItem(KEY)) return true;
  } catch {
    /* storage indisponible */
  }
  return document.cookie.split('; ').some((c) => c.startsWith(`${KEY}=`));
}

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!alreadyDecided()) setVisible(true);
  }, []);

  function decide(choice: 'accepted' | 'refused') {
    document.cookie = `${KEY}=${choice}; max-age=${SIX_MONTHS}; path=/; SameSite=Lax`;
    try {
      localStorage.setItem(KEY, choice);
    } catch {
      /* pas bloquant */
    }
    // permet à <GoogleAnalytics> de (dé)charger GA immédiatement, sans reload
    window.dispatchEvent(new CustomEvent('sun-consent', { detail: choice }));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="cookie-banner glass"
      role="dialog"
      aria-label="Consentement aux cookies"
      aria-live="polite"
    >
      <p className="cookie-banner__text">
        On utilise des cookies pour mesurer l’audience du site et améliorer ta
        navigation. Tu peux accepter ou refuser — ton choix est conservé 6 mois.
      </p>
      <div className="cookie-banner__actions">
        <button type="button" className="btn btn--amber" onClick={() => decide('accepted')}>
          Accepter
        </button>
        <button
          type="button"
          className="btn cookie-banner__refuse"
          onClick={() => decide('refused')}
        >
          Refuser
        </button>
      </div>
    </div>
  );
}
