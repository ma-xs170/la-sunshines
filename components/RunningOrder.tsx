import type { ScheduleEntry } from '@/lib/store';

// clé de tri : « 18h00 » / « 18:00 » / « 18h » → 1800 ; vide → très tard
function timeKey(t: string): number {
  const m = t.match(/(\d{1,2})\s*[h:]\s*(\d{0,2})/);
  if (!m) return 99_99;
  return Number(m[1]) * 100 + Number(m[2] || 0);
}

export default function RunningOrder({ schedule }: { schedule: ScheduleEntry[] }) {
  const rows = [...schedule]
    .filter((s) => s.time || s.artistName || s.label)
    .sort((a, b) => timeKey(a.time) - timeKey(b.time));

  if (rows.length === 0) return null;

  return (
    <div className="ro glass">
      <ul className="ro__list">
        {rows.map((s) => (
          <li className="ro__row" key={s.id}>
            <span className="ro__time">{s.time || '—'}</span>
            <span className="ro__body">
              {s.artistName && <span className="ro__name">{s.artistName}</span>}
              {s.label && <span className="ro__label">{s.label}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
