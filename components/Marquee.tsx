import ArtistName from './ArtistName';

const NAMES: { label: string; hl?: boolean }[] = [
  { label: 'Dreezy' },
  { label: 'Timalash', hl: true },
  { label: 'Lil Scott' },
  { label: 'Jeune Aber' },
  { label: 'LATOP', hl: true },
  { label: 'DJ Syxtee' },
  { label: 'et bien d’autres…', hl: true },
];

// 3 étoiles décoratives par nom, positions dispersées (voir .mq-star--n en CSS).
const STARS = [1, 2, 3];

export default function Marquee() {
  return (
    <div className="marquee">
      <p className="marquee__tag">Ils ont mis le feu</p>
      <p className="marquee__names">
        {NAMES.map((n) => (
          <span key={n.label} className={n.hl ? 'mq-name hl' : 'mq-name'}>
            <span className="mq-name__label">
              <ArtistName name={n.label} />
            </span>
            {STARS.map((s) => (
              <span key={s} className={`mq-star mq-star--${s}`} aria-hidden="true">
                ✨
              </span>
            ))}
          </span>
        ))}
      </p>
    </div>
  );
}
