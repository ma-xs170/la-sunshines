import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import Icon from '@/components/Icon';
import {
  getArtistProfiles,
  getArtistBySlug,
  editionsForArtist,
  artistSocials,
} from '@/lib/artistProfiles';
import { formatEditionDate } from '@/lib/format';
import { rgba, washTint } from '@/lib/gradient';
import type { Edition } from '@/lib/editions';

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return getArtistProfiles().map((a) => ({ slug: a.slug }));
}

// profils créés après le build -> rendus à la demande
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const a = getArtistBySlug(slug);
  if (!a) return {};
  const title = `${a.name} · LA SUNSHINES`;
  const description = a.bio
    ? a.bio.replace(/\s+/g, ' ').trim().slice(0, 200)
    : `${a.name}${a.role ? ` — ${a.role}` : ''}. Line-up et éditions LA SUNSHINES.`;
  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: {
      type: 'profile',
      locale: 'fr_FR',
      title,
      description,
      images: a.image ? [{ url: a.image }] : [],
    },
  };
}

/**
 * Carte d'édition sur un profil artiste — flyer + badge statut + nom + lieu + date,
 * en grille. Reprend le badge `.badge` / `.badge--next` déjà utilisé sur le site.
 */
function EditionCardMini({
  edition,
  status,
}: {
  edition: Edition;
  status: 'upcoming' | 'past';
}) {
  return (
    <li>
      <Link className="a-ed-card" href={`/editions/${edition.slug}`}>
        <span
          className="a-ed-card__media"
          style={
            edition.flyer
              ? ({ '--flyer-src': `url("${edition.flyer}")` } as CSSProperties)
              : undefined
          }
        >
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
            <span className="a-ed-card__media a-ed-card__media--pending">
              <Icon name="sparkles" />
            </span>
          )}
          <span
            className={
              status === 'upcoming' ? 'badge badge--next' : 'badge'
            }
          >
            {status === 'upcoming' ? 'À venir' : 'Passée'}
          </span>
        </span>
        <span className="a-ed-card__body">
          <span className="a-ed-card__name">
            <span aria-hidden="true">{edition.emoji}</span> {edition.name}
          </span>
          {edition.venue && (
            <span className="a-ed-card__venue">
              <Icon name="map-pin" className="icon" />
              {edition.venue}
            </span>
          )}
          <span className="a-ed-card__date">
            {edition.dateISO
              ? formatEditionDate(edition.dateISO)
              : edition.dateFull}
          </span>
        </span>
      </Link>
    </li>
  );
}

export default async function ArtistPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const artist = getArtistBySlug(slug);
  if (!artist) notFound();

  const { upcoming, past } = editionsForArtist(artist);
  const socials = artistSocials(artist);
  const hasEditions = upcoming.length > 0 || past.length > 0;

  // Flyer de bannière : la prochaine édition à venir (la plus proche), sinon la
  // passée la plus récente (`past` est déjà trié du plus récent au plus ancien).
  const bannerEd =
    upcoming.length > 0
      ? [...upcoming].sort((a, b) =>
          (a.dateISO ?? '').localeCompare(b.dateISO ?? ''),
        )[0]
      : (past[0] ?? null);

  const tint = washTint(bannerEd?.dominantColor);
  const bannerStyle = {
    '--ab-flyer': bannerEd?.flyer ? `url("${bannerEd.flyer}")` : 'none',
    // voile teinté qui se fond vers le fond crème en bas (pas de bord net)
    '--ab-wash': `linear-gradient(180deg, ${rgba(tint, 0.5)} 0%, ${rgba(
      tint,
      0.46,
    )} 42%, ${rgba(tint, 0.32)} 72%, var(--bg) 100%)`,
  } as CSSProperties;

  return (
    <>
      <Nav />

      <main className="artist">
        <header
          className={
            bannerEd?.flyer ? 'artist-banner' : 'artist-banner artist-banner--plain'
          }
          style={bannerStyle}
        >
          {bannerEd?.flyer && (
            <div className="artist-banner__bg" aria-hidden="true" />
          )}
          <div className="artist-banner__wash" aria-hidden="true" />
          <div className="artist-banner__shade" aria-hidden="true" />

          <div className="artist-banner__inner">
            <Link className="artist-banner__back" href="/editions">
              <Icon name="arrow-right" className="icon artist-banner__back-ico" />
              Retour aux éditions
            </Link>

            <div className="artist-banner__id">
              {artist.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  className="artist-photo"
                  src={artist.image}
                  alt={artist.name}
                />
              ) : (
                <div
                  className="artist-photo artist-photo--empty"
                  aria-hidden="true"
                >
                  <Icon name="sparkles" />
                </div>
              )}

              <div className="artist-banner__txt">
                {artist.role && (
                  <span className="artist-role">{artist.role}</span>
                )}
                <h1 className="artist-name">{artist.name}</h1>
              </div>
            </div>
          </div>
        </header>

        {socials.length > 0 && (
          <ul className="artist-socials">
            {socials.map((s) => (
              <li key={s.kind}>
                <a
                  href={s.href}
                  target={s.kind === 'email' ? undefined : '_blank'}
                  rel={s.kind === 'email' ? undefined : 'noopener noreferrer'}
                  aria-label={s.label}
                >
                  <Icon name={s.icon} className="icon" />
                  <span>{s.label}</span>
                </a>
              </li>
            ))}
          </ul>
        )}

        {artist.bio && (
          <section className="artist-section">
            <p className="script">Bio</p>
            <p className="artist-bio">{artist.bio}</p>
          </section>
        )}

        <section className="artist-section">
          <p className="script">Sur scène</p>
          <h2>Éditions à venir</h2>
          {upcoming.length > 0 ? (
            <ul className="artist-eds">
              {upcoming.map((e) => (
                <EditionCardMini key={e.slug} edition={e} status="upcoming" />
              ))}
            </ul>
          ) : (
            <p className="artist-empty">
              {hasEditions
                ? 'Aucune date à venir pour le moment.'
                : 'Pas encore d’édition référencée pour cet artiste.'}
            </p>
          )}
        </section>

        {past.length > 0 && (
          <section className="artist-section">
            <p className="script">Déjà passé·e par là</p>
            <h2>Éditions passées</h2>
            <ul className="artist-eds">
              {past.map((e) => (
                <EditionCardMini key={e.slug} edition={e} status="past" />
              ))}
            </ul>
          </section>
        )}
      </main>

      <Footer />
    </>
  );
}
