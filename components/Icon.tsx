// <Icon name="sun" /> => <svg class="icon"><use href="#i-sun" /></svg>
// Reprend la mécanique du sprite de l'ancienne version : le style de trait
// vient de `.icon` dans globals.css, la taille aussi.

export type IconName =
  | 'sun'
  | 'map-pin'
  | 'cake'
  | 'ticket'
  | 'shield'
  | 'shirt'
  | 'car'
  | 'sparkles'
  | 'calendar'
  | 'clock'
  | 'history'
  | 'instagram'
  | 'tiktok'
  | 'whatsapp'
  | 'phone'
  | 'mail'
  | 'soundcloud'
  | 'arrow-right'
  | 'arrow-up-right'
  | 'chevron-right'
  | 'chevron-left'
  | 'download'
  | 'share'
  | 'menu'
  | 'close'
  | 'check'
  | 'bell'
  | 'archive'
  | 'inbox';

export default function Icon({
  name,
  className = 'icon',
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}
