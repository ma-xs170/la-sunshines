import type { CSSProperties, ReactNode } from 'react';
import Icon, { type IconName } from './Icon';
import { dresscodeGradient, formatDresscodeLabel } from '@/lib/dresscode';

// Composant PARTAGÉ des pills d'infos : date / heure / dresscode (+ âge).
// Utilisé par :
//   - le hero des pages événement /editions/[slug]   (tone="dark")
//   - les cartes de la liste « LES ÉDITIONS » homepage (tone="light")
// Chaque pill = capsule « liquid glass » enveloppant le rond icône + le texte.
// (Le lieu n'est plus dans cette rangée — affiché en texte simple ailleurs.)

type Tone = 'dark' | 'light';

function Pill({
  icon,
  dc,
  upper,
  children,
}: {
  icon: IconName;
  dc?: string | null;
  upper?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={'evm-block' + (upper ? ' evm-block--upper' : '')}>
      <span
        className={'evm-ico' + (dc ? ' evm-ico--dresscode' : '')}
        style={dc ? ({ '--dc': dc } as CSSProperties) : undefined}
      >
        <Icon name={icon} />
      </span>
      <span className="evm-text">{children}</span>
    </div>
  );
}

export default function EventMeta({
  dateFull,
  timeLabel,
  dresscode,
  ageLabel,
  tone = 'dark',
}: {
  dateFull: string;
  timeLabel?: string;
  dresscode?: string;
  ageLabel?: string;
  tone?: Tone;
}) {
  const dc = dresscode ? dresscodeGradient(dresscode) : null;

  return (
    <div className={'event-meta' + (tone === 'light' ? ' event-meta--light' : '')}>
      {dateFull && (
        <Pill icon="calendar" upper>
          {dateFull}
        </Pill>
      )}
      {timeLabel && (
        <Pill icon="clock" upper>
          {timeLabel}
        </Pill>
      )}
      {dresscode && (
        <Pill icon="shirt" dc={dc} upper>
          {formatDresscodeLabel(dresscode)}
        </Pill>
      )}
      {ageLabel && <Pill icon="cake">{ageLabel}</Pill>}
    </div>
  );
}
