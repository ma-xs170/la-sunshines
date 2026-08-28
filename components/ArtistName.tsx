import Link from 'next/link';
import { findArtistProfile } from '@/lib/artistProfiles';

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
