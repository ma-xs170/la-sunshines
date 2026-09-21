import type { CSSProperties, ReactNode } from 'react';
import Icon, { type IconName } from './Icon';
import { dresscodeGradient, formatDresscodeLabel } from '@/lib/dresscode';
import { dresscodeText, readableOn, type DresscodeValue } from '@/lib/dresscodeColors';

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
  structured,
  tone = 'dark',
}: {
  dateFull: string;
  timeLabel?: string;
  dresscode?: string;
  ageLabel?: string;
  /** Dresscode structuré saisi par l'organisateur : prioritaire sur le texte libre. */
  structured?: DresscodeValue | null;
  tone?: Tone;
}) {
  const hasStructured = Boolean(structured && (structured.free || structured.colors.length));
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
      {hasStructured && structured && (
        <Pill icon="shirt" upper>
          <span className="evm-dc">
            <span className="evm-dc__label">Dresscode</span>
            {structured.free
              ? <span className="evm-dc__name">Tenue libre</span>
              : structured.colors.map((c) => (
                  <span className="evm-dc__chip" key={c.name} style={{ background: c.hex, color: readableOn(c.hex) }}>{c.name}</span>
                ))}
            {structured.note && <span className="evm-dc__note">{structured.note}</span>}
          </span>
          <span className="sr-only">{`Dresscode : ${dresscodeText(structured)}`}</span>
        </Pill>
      )}
      {!hasStructured && dresscode && (
        <Pill icon="shirt" dc={dc} upper>
          {formatDresscodeLabel(dresscode)}
        </Pill>
      )}
      {ageLabel && <Pill icon="cake">{ageLabel}</Pill>}
    </div>
  );
}
