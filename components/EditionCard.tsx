import type { CSSProperties } from 'react';
import Link from 'next/link';
import Icon from './Icon';
import EventMeta from './EventMeta';
import type { Edition } from '@/lib/editions';

function cls(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

// Fond flou du flyer derrière la version « contain » (aucun crop, pas de bande vide).
function mediaStyle(flyer: string | null): CSSProperties | undefined {
  return flyer ? ({ '--flyer-src': `url("${flyer}")` } as CSSProperties) : undefined;
}

function NextCard({ edition, hidden }: { edition: Edition; hidden: boolean }) {
  return (
    <article
      // `hidden` via style inline (pas via className) : sinon React recompose la
      // className à chaque changement de filtre et efface le `.is-in` ajouté
      // impérativement par SiteEffects -> carte bloquée à opacity:0 au retour.
      className={cls('ed-card', 'ed-card--next', 'glass')}
      style={hidden ? { display: 'none' } : undefined}
      data-reveal
      data-status="next"
    >
      <div
        className={cls('ed-card__media', !edition.flyer && 'ed-card__media--pending')}
        style={mediaStyle(edition.flyer)}
      >
        <span className="badge badge--next">À venir</span>
        {edition.flyer ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={edition.flyer}
            width={edition.flyerSize?.w}
            height={edition.flyerSize?.h}
            alt={edition.flyerAlt ?? `Affiche officielle — ${edition.name}`}
            loading="lazy"
          />
        ) : (
          <div className="pending">
            <Icon name="sparkles" />
            <span>
              Affiche dévoilée
              <br />
              très bientôt
            </span>
          </div>
        )}
      </div>
      <div className="ed-card__body">
        <p className="kicker">{edition.kicker}</p>
        <h3>
          <span className="ed-card__emoji" aria-hidden="true">
            {edition.emoji}
          </span>
          {edition.name}
        </h3>
        {edition.tagline && <p className="ed-card__tagline">{edition.tagline}</p>}
        {edition.venue && (
          <p className="ed-card__loc">
            <Icon name="map-pin" />
            {edition.venue}
          </p>
        )}
        <EventMeta
          dateFull={edition.dateFull}
          timeLabel={edition.timeLabel}
          dresscode={edition.dresscode}
          tone="light"
        />
        <div className="ed-card__actions">
          {/* CTA principal -> billetterie Bizouk réelle de la fiche événement
              (edition.bizoukUrl, nouvel onglet). Repli sur l'ancre locale
              #billetterie tant qu'aucune URL Bizouk n'est renseignée. */}
          {edition.bizoukUrl ? (
            <a
              className="btn btn--amber"
              href={edition.bizoukUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="ticket" />
              <span>Préventes Bizouk &amp; Kiwol</span>
            </a>
          ) : (
            <a className="btn btn--amber" href="/#billetterie">
              <Icon name="ticket" />
              <span>Préventes Bizouk &amp; Kiwol</span>
            </a>
          )}
          <Link className="btn btn--outline" href={`/editions/${edition.slug}`}>
            <span>Voir</span>
            <Icon name="arrow-right" />
          </Link>
        </div>
      </div>
    </article>
  );
}

function PastCard({ edition, hidden }: { edition: Edition; hidden: boolean }) {
  return (
    <article
      className={cls('ed-card', 'glass')}
      style={hidden ? { display: 'none' } : undefined}
      data-reveal
      data-status="past"
    >
      <div className="ed-card__media" style={mediaStyle(edition.flyer)}>
        {edition.flyer && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={edition.flyer}
            width={edition.flyerSize?.w}
            height={edition.flyerSize?.h}
            alt={edition.flyerAlt ?? `Affiche officielle — ${edition.name}`}
            loading="lazy"
          />
        )}
        <span className="badge">Passée</span>
      </div>
      <div className="ed-card__body">
        <p className="kicker">{edition.kicker}</p>
        <h3>
          <span className="ed-card__emoji" aria-hidden="true">
            {edition.emoji}
          </span>
          {edition.name}
        </h3>
        {edition.venue && (
          <p className="ed-card__loc">
            <Icon name="map-pin" />
            {edition.venue}
          </p>
        )}
        {edition.headliner && (
          <>
            <p className="ed-card__hl-label">Headliner</p>
            <p className="ed-card__hl-name">{edition.headliner}</p>
          </>
        )}
        <EventMeta
          dateFull={edition.dateFull}
          timeLabel={edition.timeLabel}
          dresscode={edition.dresscode}
          tone="light"
        />
        <div className="ed-card__actions">
          <Link className="btn btn--outline" href={`/editions/${edition.slug}`}>
            <span>Voir</span>
            <Icon name="arrow-right" />
          </Link>
          {edition.bizoukUrl && (
            <a
              className="ed-card__bizouk"
              href={edition.bizoukUrl}
              target="_blank"
              rel="noopener"
            >
              Acheter sur Bizouk
              <Icon name="arrow-up-right" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export default function EditionCard({
  edition,
  hidden = false,
}: {
  edition: Edition;
  hidden?: boolean;
}) {
  return edition.status === 'next' ? (
    <NextCard edition={edition} hidden={hidden} />
  ) : (
    <PastCard edition={edition} hidden={hidden} />
  );
}
