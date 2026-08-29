import type { ScheduleEntry } from '@/lib/store';
import { groupSchedule } from '@/lib/schedule';

/**
 * Timeline verticale du programme. Chaque créneau horaire = un jalon ; sous
 * chaque jalon, la liste des artistes / labels de ce créneau (un ou plusieurs).
 * Les entrées « tête d'affiche » sont mises en avant. Rien si vide.
 */
export default function RunningOrder({ schedule }: { schedule: ScheduleEntry[] }) {
  const groups = groupSchedule(schedule);
  if (groups.length === 0) return null;

  return (
    <div className="ro glass">
      <ol className="ro__line">
        {groups.map((g) => (
          <li className="ro__slot" key={g.time || 'sans-heure'}>
            <div className="ro__time">{g.time || '—'}</div>
            <ul className="ro__items">
              {g.entries.map((e) => (
                <li
                  className={e.headliner ? 'ro__item ro__item--head' : 'ro__item'}
                  key={e.id}
                >
                  {e.headliner && <span className="ro__tag">Tête d’affiche</span>}
                  {e.artistName && <span className="ro__name">{e.artistName}</span>}
                  {e.label && <span className="ro__label">{e.label}</span>}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
