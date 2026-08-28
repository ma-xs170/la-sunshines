import Icon from './Icon';
import { isVenuePublic } from '@/lib/venue';

// Carte Google Maps (embed sans clé API) centrée sur le lieu de l'édition.
// Si le lieu n'est pas encore communiqué → message discret à la place.
export default function EventMap({ venue }: { venue: string | null }) {
  if (!isVenuePublic(venue)) {
    return (
      <div className="event-map event-map--pending glass">
        <Icon name="map-pin" />
        <p>Le lieu sera communiqué prochainement.</p>
      </div>
    );
  }

  const place = venue as string;
  const src = `https://www.google.com/maps?q=${encodeURIComponent(place)}&output=embed`;

  return (
    <div className="event-map">
      <iframe
        src={src}
        width="100%"
        height="400"
        style={{ border: 0 }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        title={`Localisation — ${place}`}
      />
    </div>
  );
}
