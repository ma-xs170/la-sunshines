import type { CSSProperties } from 'react';
import Icon from './Icon';
import { isEditionUpcoming, type Edition } from '@/lib/editions';
import { formatEditionDate, formatEditionDateShort } from '@/lib/format';

// Espaces insécables autour des guillemets « … » (évite un guillemet orphelin).
const NB = String.fromCharCode(160);
function nbsp(s: string) {
  return s.replace(/«\s+/g, `«${NB}`).replace(/\s+»/g, `${NB}»`);
}

export default function CtaBand({
  edition,
  neutral = false,
}: {
  edition?: Edition;
  /** état neutre : aucune édition mise en avant (ex. prochaine soirée masquée
   *  depuis /admin). Message générique + lien vers /editions, pas de flyer ni
   *  de billetterie. */
  neutral?: boolean;
}) {
  if (neutral || !edition) {
    return (
      <section
        className="cta-band cta-band--thanks cta-band--neutral glass"
        id="billetterie"
        data-reveal
      >
        <p className="cta-band__thanks">
          Merci pour votre confiance <span aria-hidden="true">✨</span>
        </p>
        <div className="btn-row">
          <a className="btn btn--outline btn--lg" href="/editions">
            <span>Voir toutes les éditions</span>
            <Icon name="arrow-right" />
          </a>
        </div>
      </section>
    );
  }

  const upcoming = isEditionUpcoming(edition);

  // le flyer de l'édition en fond ; l'assombrissement/flou est fait en CSS
  // (.cta-band::before + ::after), même principe que l'overlay du hero.
  const style = edition.flyer
    ? ({ '--cta-flyer': `url("${edition.flyer}")` } as CSSProperties)
    : undefined;

  // Édition passée -> bandeau « Merci » (bascule automatique par la date,
  // même logique que les badges À venir/Passée et le widget billetterie).
  if (!upcoming) {
    return (
      <section
        className="cta-band cta-band--thanks glass"
        id="billetterie"
        data-reveal
        style={style}
      >
        <p className="cta-band__thanks">
          Merci&nbsp;! <span aria-hidden="true">🤍</span>
        </p>
      </section>
    );
  }

  const dresscode = edition.dresscode.replace(/^dresscode\s+/i, '');
  const meta = [
    formatEditionDate(edition.dateISO),
    edition.timeLabel,
    edition.venue,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="cta-band glass" id="billetterie" data-reveal style={style}>
      <span className="script">Prochaine soirée · {edition.name}</span>
      <p className="cta-band__date">{formatEditionDateShort(edition.dateISO)}</p>
      <p className="cta-band__meta">{meta}</p>
      {edition.tagline && (
        <p className="cta-band__text">{nbsp(edition.tagline)}</p>
      )}
      <p className="cta-band__note">
        Dresscode <strong>{dresscode}</strong> obligatoire · Réservé aux 12–17 ans
      </p>
      <div className="btn-row">
        <a
          className="btn btn--amber btn--lg"
          href={edition.bizoukUrl ?? '#'}
          {...(edition.bizoukUrl ? { target: '_blank', rel: 'noopener' } : {})}
        >
          <Icon name="ticket" />
          <span>Préventes Bizouk &amp; Kiwol</span>
        </a>
        <a className="btn btn--outline btn--lg" href={`/editions/${edition.slug}`}>
          <span>Voir l&apos;édition</span>
          <Icon name="arrow-right" />
        </a>
      </div>
    </section>
  );
}
