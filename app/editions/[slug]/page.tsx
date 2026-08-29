import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import Icon from '@/components/Icon';
import { getAllEditions, getEditionBySlug } from '@/lib/content';
import { isDarkTheme, pageTint } from '@/lib/gradient';
import { isEditionUpcoming } from '@/lib/editions';
import { getTimetable } from '@/lib/timetables';
import { getBizoukEmbed } from '@/lib/bizouk';
import EventTimetable from '@/components/EventTimetable';
import BizoukWidget from '@/components/BizoukWidget';
import BizoukClosed from '@/components/BizoukClosed';
import EventAtmosphere from '@/components/EventAtmosphere';
import EventEmojiField from '@/components/EventEmojiField';
import EventMap from '@/components/EventMap';
import EventMeta from '@/components/EventMeta';
import ComingSoon from '@/components/ComingSoon';
import FlyerLightbox from '@/components/FlyerLightbox';
import GalleryLightbox from '@/components/GalleryLightbox';
import ArtistName from '@/components/ArtistName';

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return getAllEditions().map((e) => ({ slug: e.slug }));
}

// les événements ajoutés via /admin après le build restent rendus à la demande
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const ed = getEditionBySlug(slug);
  if (!ed) return {};

  const title = `${ed.name} · LA SUNSHINES`;
  const description = ed.tagline
    ? ed.tagline.replace(/[«»"]/g, '').trim()
    : `${ed.name} — ${ed.dateFull}${ed.timeLabel ? ` · ${ed.timeLabel}` : ''}${ed.venue ? `, ${ed.venue}` : ''}. Line-up, infos et billetterie LA SUNSHINES.`;

  return {
    title,
    description,
    openGraph: {
      type: 'article',
      locale: 'fr_FR',
      title,
      description,
      images: ed.flyer ? [{ url: ed.flyer }] : [],
    },
  };
}

export default async function EditionPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const ed = getEditionBySlug(slug);
  if (!ed) notFound();

  const embed = ed.bizoukEmbed?.trim() || getBizoukEmbed(slug);
  const upcoming = isEditionUpcoming(ed);
  const timetable = getTimetable(slug);

  // Nom d'artiste normalisé pour comparaison (casse, espaces, préfixe « DJ »).
  const normArtist = (s: string) =>
    s.toLowerCase().trim().replace(/\s+/g, ' ').replace(/^dj\s+/, '');

  const headlinerNames = ed.headliner
    ? ed.headliner
        .split(/\s*·\s*/)
        .map((n) => n.trim())
        .filter(Boolean)
    : [];
  const headlinerSet = new Set(headlinerNames.map(normArtist));

  // LINE-UP COMPLET = artistes secondaires uniquement (hors têtes d'affiche).
  const secondaryLineup = ed.lineup.filter((a) => !headlinerSet.has(normArtist(a)));
  const hasRawLineup = ed.lineup.length > 0;
  const showLineupSection = !hasRawLineup || secondaryLineup.length > 0;

  // Theming automatique : la zone haute de la page (derrière la nav → 1re
  // section) prend la teinte du flyer et se fond vers le crème. Si cette teinte
  // est sombre, le texte de la zone bascule en clair (cf. `.event--themed`).
  const darkTheme = isDarkTheme(ed.dominantColor, ed.palette);
  const eventStyle = {
    '--ev-tint': pageTint(ed.palette, ed.dominantColor),
  } as CSSProperties;

  return (
    <>
      <Nav />
      <EventAtmosphere edition={ed} />

      <main
        className={darkTheme ? 'event event--themed' : 'event'}
        style={eventStyle}
      >
        {ed.emoji && <EventEmojiField key={ed.slug} emoji={ed.emoji} />}

        <header
          className="event-hero"
          style={{ '--ev-gradient': ed.gradient } as CSSProperties}
        >
          <div className="event-hero__inner">
            <div className="event-hero__col">
              <Link className="event-back" href="/editions">
                <Icon name="arrow-right" className="icon event-back__ico" />
                Toutes les éditions
              </Link>

              <p className="event-hero__kicker">{ed.kicker}</p>
              <h1 className="event-hero__title">
                <span className="event-hero__emoji" aria-hidden="true">
                  {ed.emoji}
                </span>
                {ed.name}
              </h1>
              {ed.tagline && <p className="event-hero__tagline">{ed.tagline}</p>}

              <EventMeta
                dateFull={ed.dateFull}
                timeLabel={ed.timeLabel}
                dresscode={ed.dresscode}
              />

              <div className="event-hero__links">
                <Link className="event-rules-link" href="/interdits">
                  <Icon name="shield" className="icon" />
                  Lire le règlement
                </Link>
                <Link className="event-rules-link" href="/contact">
                  <Icon name="phone" className="icon" />
                  Info-line
                </Link>
              </div>

              {ed.venue && (
                <p className="event-hero__venue">
                  <Icon name="map-pin" className="icon" />
                  {ed.venue}
                </p>
              )}
            </div>

            <figure className="event-flyer">
              {ed.flyer ? (
                <FlyerLightbox
                  src={ed.flyer}
                  width={ed.flyerSize?.w}
                  height={ed.flyerSize?.h}
                  alt={ed.flyerAlt ?? `Affiche officielle — ${ed.name}`}
                  downloadName={`la-sunshines-${ed.slug}.${
                    ed.flyer.split('.').pop() ?? 'jpg'
                  }`}
                  title={ed.name}
                />
              ) : (
                <div className="event-flyer__pending">
                  <Icon name="sparkles" />
                  <span>Affiche à venir</span>
                </div>
              )}
            </figure>
          </div>
        </header>

        {(embed || ed.bizoukUrl) && (
          <section className="event-section">
            <p className="script">
              {upcoming ? 'Réserver ta place' : 'Billetterie'}
            </p>
            <h2>Billetterie</h2>
            {upcoming && embed ? (
              <BizoukWidget embed={embed} />
            ) : (
              <BizoukClosed bizoukUrl={ed.bizoukUrl} />
            )}
          </section>
        )}

        <section className="event-section">
          <p className="script">La tête d’affiche</p>
          <h2>Headliner</h2>
          {headlinerNames.length > 0 ? (
            <ul className="lineup">
              {headlinerNames.map((name) => (
                <li className="lineup__pill" key={name}>
                  <ArtistName name={name} />
                </li>
              ))}
            </ul>
          ) : (
            <ComingSoon>Têtes d’affiche à annoncer prochainement.</ComingSoon>
          )}
        </section>

        {showLineupSection && (
          <section className="event-section">
            <p className="script">Sur scène</p>
            <h2>Line-up complet</h2>
            {secondaryLineup.length > 0 ? (
              <ul className="lineup">
                {secondaryLineup.map((artist) => (
                  <li className="lineup__pill" key={artist}>
                    <ArtistName name={artist} />
                  </li>
                ))}
              </ul>
            ) : (
              <ComingSoon>Line-up complet à venir.</ComingSoon>
            )}
          </section>
        )}

        {timetable && (
          <section className="event-section">
            <p className="script">Le déroulé</p>
            <h2>Programme</h2>
            <EventTimetable timetable={timetable} />
          </section>
        )}

        <section className="event-section">
          <p className="script">Localisation</p>
          <h2>Maps</h2>
          <EventMap venue={ed.venue} />
        </section>

        {/* GALERIE — en dernier ; photos gérées depuis /admin (par slug d'édition) */}
        <section className="event-section">
          <p className="script">En images</p>
          <h2>Galerie</h2>
          {ed.gallery && ed.gallery.length > 0 ? (
            <GalleryLightbox
              title={ed.name}
              images={ed.gallery.map((src, i) => ({
                src,
                downloadName: `la-sunshines-${ed.slug}-${String(i + 1).padStart(2, '0')}.jpg`,
                alt: `${ed.name} — photo ${i + 1}`,
              }))}
            />
          ) : (
            <div className="gallery gallery--empty" data-gallery>
              <Icon name="sparkles" />
              <p>Photos à venir</p>
            </div>
          )}
        </section>

        {ed.bizoukUrl && (
          <div className="event-buy">
            <a href={ed.bizoukUrl} target="_blank" rel="noopener">
              Acheter sur Bizouk
              <Icon name="arrow-up-right" />
            </a>
          </div>
        )}
      </main>

      <Footer />
    </>
  );
}
