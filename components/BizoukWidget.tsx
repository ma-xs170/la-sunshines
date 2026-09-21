import Script from 'next/script';
import { BIZOUK_WIDGET_SRC } from '@/lib/bizouk';
import { BIZOUK_SANDBOX, parseBizoukCode } from '@/lib/bizoukEmbed';

// Widget de billetterie Bizouk. Le code collé n'est JAMAIS injecté : on en extrait l'identifiant d'évènement (domaine bizouk.com uniquement)
// et on génère nous-mêmes l'iframe, avec un bac à sable (sandbox). Un code invalide n'affiche rien.
// Le script tiers widget_client.js (static.bizouk.com) est chargé une seule fois par page via next/script.
export default function BizoukWidget({ embed }: { embed: string }) {
  const p = parseBizoukCode(embed);
  if (!p.ok) return null;
  return (
    <div className="bizouk">
      <div className="bizouk__frame">
        <iframe
          src={p.src}
          name="payment-frame"
          title="Billetterie Bizouk"
          width="100%"
          height={1065}
          scrolling="yes"
          loading="lazy"
          sandbox={BIZOUK_SANDBOX}
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ backgroundColor: 'transparent', border: 0 }}
        />
      </div>
      <Script src={BIZOUK_WIDGET_SRC} strategy="afterInteractive" />
    </div>
  );
}
