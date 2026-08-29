import { isVenuePublic } from '@/lib/venue';

/** URL Google Maps (recherche) pour un nom de lieu. On suffixe « Guadeloupe »
 *  si le nom ne le mentionne pas déjà, pour lever l'ambiguïté. */
export function venueMapsUrl(venue: string): string {
  const v = venue.trim();
  const query = /guadeloupe/i.test(v) ? v : `${v}, Guadeloupe`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * Nom de lieu d'une édition. Cliquable (→ Google Maps, nouvel onglet) dès que le
 * lieu est réellement communiqué ; simple texte tant que c'est le placeholder
 * « SUN'LAND ». Hérite de la couleur du contexte ; souligné au survol.
 */
export default function VenueLink({
  venue,
  className,
}: {
  venue: string | null | undefined;
  className?: string;
}) {
  const v = venue?.trim();
  if (!v) return null;

  if (!isVenuePublic(v)) {
    return className ? <span className={className}>{v}</span> : <>{v}</>;
  }

  return (
    <a
      className={className ? `${className} venue-link` : 'venue-link'}
      href={venueMapsUrl(v)}
      target="_blank"
      rel="noopener noreferrer"
    >
      {v}
    </a>
  );
}
