import Link from 'next/link';
import { findArtistProfile, getArtistProfiles } from '@/lib/artistProfiles';
import { linkArtistText, type RowKind } from '@/lib/artistLinks';

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
 * Texte libre de programme (« DJ Sosonne · DJ Dalton », « Ayou — Tchambou »,
 * « Dreezy Keyboard Show ») : chaque NOM d'artiste est affiché en majuscules et en
 * gras (CSS seulement — le texte enregistré n'est jamais modifié) et lié à son
 * profil s'il existe. Séparateurs et mots descriptifs gardent le style courant.
 * `kind="info"` (portes, pause, fin) : texte brut, ni style ni lien.
 * `slugs` = lien explicite posé dans l'admin, prioritaire sur l'automatique.
 */
export function ArtistText({
  text,
  slugs,
  kind = 'artist',
  className,
}: {
  text: string;
  slugs?: string[];
  kind?: RowKind;
  className?: string;
}) {
  if (kind === 'info') return <>{text}</>;
  const segments = linkArtistText(text, getArtistProfiles(), slugs);
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind !== 'name') return <span key={i}>{seg.text}</span>;
        if (!seg.slug) return <span key={i} className="prog-artist">{seg.text}</span>;
        return (
          <Link
            key={i}
            href={`/artistes/${seg.slug}`}
            className={`prog-artist artist-name-link${className ? ` ${className}` : ''}`}
          >
            {seg.text}
          </Link>
        );
      })}
    </>
  );
}
