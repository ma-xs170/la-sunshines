import Script from 'next/script';
import { BIZOUK_WIDGET_SRC } from '@/lib/bizouk';

// Rend le widget de billetterie Bizouk : on n'injecte QUE l'<iframe> du code
// fourni ; le script tiers widget_client.js est chargé via next/script
// (strategy afterInteractive, dédupliqué par src → une seule fois par page).
export default function BizoukWidget({ embed }: { embed: string }) {
  const iframeOnly = embed.replace(/<script[\s\S]*?<\/script>/gi, '').trim();

  return (
    <div className="bizouk">
      <div
        className="bizouk__frame"
        dangerouslySetInnerHTML={{ __html: iframeOnly }}
      />
      <Script src={BIZOUK_WIDGET_SRC} strategy="afterInteractive" />
    </div>
  );
}
