import Link from 'next/link';
import { findArtistProfile, getArtistProfiles } from '@/lib/artistProfiles';
import { linkArtistText } from '@/lib/artistLinks';

/**
 * Affiche un nom d'artiste. S'il existe un profil (fiche créée dans /admin), le
 * nom devient un lien vers /artistes/[slug] ; sinon il reste en texte simple.
 * Composant serveur (lit le store) — utilisable partout où un nom est rendu.
 */
export default function ArtistName({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const profile = findArtistProfile(name);
  if (!profile) return <>{name}</>;
  return (
    <Link
      href={`/artistes/${profile.slug}`}
      className={className ? `${className} artist-name-link` : 'artist-name-link'}
    >
      {name}
    </Link>
  );
}

/** Variante pour une chaîne « A · B · C » : découpe et lie chaque nom. */
export function ArtistNameList({
  value,
  separator = ' · ',
  className,
}: {
  value: string;
  separator?: string;
  className?: string;
}) {
  const parts = value
    .split(/\s*·\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <>
      {parts.map((p, i) => (
        <span key={`${p}-${i}`}>
          {i > 0 && separator}
          <ArtistName name={p} className={className} />
        </span>
      ))}
    </>
  );
}

/**
 * Texte libre de programme (« DJ Sosonne · DJ Dalton », « Timalash & Lil Scott ») :
 * chaque nom qui correspond à un profil devient un lien distinct ; séparateurs et
 * noms sans profil restent du texte simple (aucun lien mort). `slugs` = lien
 * explicite posé dans l'admin, prioritaire sur la liaison automatique.
 */
export function ArtistText({
  text,
  slugs,
  className,
}: {
  text: string;
  slugs?: string[];
  className?: string;
}) {
  const segments = linkArtistText(text, getArtistProfiles(), slugs);
  return (
    <>
      {segments.map((seg, i) =>
        seg.slug ? (
          <Link
            key={i}
            href={`/artistes/${seg.slug}`}
            className={className ? `${className} artist-name-link` : 'artist-name-link'}
          >
            {seg.text}
          </Link>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}
