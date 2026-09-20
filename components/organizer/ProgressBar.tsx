import { progress } from '@/lib/organizer/status';

/** Barre de progression des ventes : vendus (dégradé ambre → corail), puis réservations en cours en teinte atténuée. */
export default function ProgressBar({ sold, reserved, capacity, label, compact = false }: { sold: number; reserved: number; capacity: number; label?: string; compact?: boolean }) {
  const p = progress(sold, reserved, capacity);
  const text = `${sold} / ${capacity} vendus · ${p.totalPct} %${reserved > 0 ? ` · +${reserved} en cours` : ''}`;
  return (
    <div className={'org-bar' + (compact ? ' org-bar--compact' : '')}>
      {label && <p className="org-bar__label">{label}</p>}
      <div className="org-bar__track" role="progressbar" aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={sold} aria-label={text}>
        <span className="org-bar__sold" style={{ width: `${p.soldPct}%` }} />
        <span className="org-bar__reserved" style={{ width: `${p.reservedPct}%` }} />
      </div>
      <p className="org-bar__text">{text}</p>
    </div>
  );
}
