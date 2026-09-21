import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import Icon from '@/components/Icon';
import { getAllEditions, getEditionBySlug } from '@/lib/content';
import { isDarkTheme, pageTheme } from '@/lib/gradient';
import { isEditionUpcoming } from '@/lib/editions';
import { getTimetable } from '@/lib/timetables';
import { getBizoukEmbed } from '@/lib/bizouk';
import EventTimetable from '@/components/EventTimetable';
import RunningOrder from '@/components/RunningOrder';
import BizoukWidget from '@/components/BizoukWidget';
import BizoukClosed from '@/components/BizoukClosed';
import TicketPanel from '@/components/ticketing/TicketPanel';
import { getPublicTicketing } from '@/lib/ticketing/events';
import EventAtmosphere from '@/components/EventAtmosphere';
import EventEmojiField from '@/components/EventEmojiField';
import EventMap from '@/components/EventMap';
import EventMeta from '@/components/EventMeta';
import ComingSoon from '@/components/ComingSoon';
import FlyerLightbox from '@/components/FlyerLightbox';
import FlyerVideo from '@/components/FlyerVideo';
import { getPublicEventDetails } from '@/lib/publicEventDetails';
import { getEventOrganizer } from '@/lib/publicOrganizer';
import OrganizerAvatar from '@/components/OrganizerAvatar';
import GalleryLightbox from '@/components/GalleryLightbox';
import ArtistName from '@/components/ArtistName';
import VenueLink from '@/components/VenueLink';

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return getAllEditions().map((e) => ({ slug: e.slug }));
}

// les événements ajoutés via /admin après le build restent rendus à la demande
export const dynamicParams = true;

// Le mode de billetterie (Bizouk / interne) se lit dans Supabase : la page se
// régénère au plus toutes les 60 s, et immédiatement quand l'admin bascule le flag.
export const revalidate = 60;

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
  // Billetterie interne : null tant que le flag est sur « bizouk » (défaut), que Supabase
  // n'est pas configuré ou que l'événement n'est pas activé → la page reste identique.
  const ticketing = upcoming ? await getPublicTicketing(slug) : null;
  // Détails saisis par l'organisateur (dresscode couleurs, flyer vidéo) : null tant que rien n'est publié → fiche inchangée.
  const extra = await getPublicEventDetails(slug);
  const organizer = await getEventOrganizer(slug);   // null tant que le mode public est « bizouk » : aucun bloc affiché

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

  // Theming automatique : TOUTE la page événement (fond, encre, accent, filets,
  // panneaux, voile du hero) est teintée par la couleur du flyer. `pageTheme`
  // renvoie le jeu complet de variables ; `event--themed` marque le mode sombre
  // (fond sombre + encre claire) pour les quelques réglages non pilotables par
  // variable seule.
  const darkTheme = isDarkTheme(ed.dominantColor, ed.palette);
  const eventStyle = pageTheme(ed.palette, ed.dominantColor) as unknown as CSSProperties;

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
                structured={extra?.dresscode}
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
                  <VenueLink venue={ed.venue} />
                </p>
              )}
            </div>

            <figure className="event-flyer">
              {extra?.video && (extra.video.hevc_url || extra.video.h264_url) ? (
                <FlyerVideo hevc={extra.video.hevc_url} h264={extra.video.h264_url} poster={extra.video.poster_url ?? ed.flyer ?? null} alt={ed.flyerAlt ?? `Affiche animée — ${ed.name}`} />
              ) : ed.flyer ? (
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

        {ticketing && (
          <section className="event-section">
            <p className="script">Réserver ta place</p>
            <h2>Billetterie</h2>
            <TicketPanel
              slug={slug}
              tiers={ticketing.tiers}
              feePercent={ticketing.settings.feePercent}
              feeFixedCents={ticketing.settings.feeFixedCents}
            />
          </section>
        )}

        {!ticketing && (embed || ed.bizoukUrl) && (
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

        {ed.schedule && ed.schedule.length > 0 ? (
          <section className="event-section">
            <p className="script">Le déroulé</p>
            <h2>Programme</h2>
            <RunningOrder schedule={ed.schedule} />
          </section>
        ) : timetable ? (
          <section className="event-section">
            <p className="script">Le déroulé</p>
            <h2>Programme</h2>
            <EventTimetable timetable={timetable} />
          </section>
        ) : null}

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

        {/* lien Bizouk de fin de page : masqué quand la billetterie interne est active */}
        {!ticketing && ed.bizoukUrl && (
          <div className="event-buy">
            <a href={ed.bizoukUrl} target="_blank" rel="noopener">
              Acheter sur Bizouk
              <Icon name="arrow-up-right" />
            </a>
          </div>
        )}

        {organizer && (
          <section className="event-org" aria-label="Organisateur">
            <OrganizerAvatar name={organizer.name} src={organizer.logo_url} size={56} />
            <div><p className="event-org__label">Organisé par</p><p className="event-org__name">{organizer.name}</p></div>
            <Link className="btn btn--outline" href={`/organisateurs/${organizer.slug}`}>Suivre | Voir les évènements</Link>
          </section>
        )}
      </main>

      <Footer />
    </>
  );
}
