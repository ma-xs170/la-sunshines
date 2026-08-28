import {
  isTimetableGroup,
  type Timetable,
  type TimetableRow,
} from '@/lib/timetables';

function Row({ row, sub = false }: { row: TimetableRow; sub?: boolean }) {
  return (
    <li
      className={
        'tt-row' +
        (row.strong ? ' tt-row--strong' : '') +
        (sub ? ' tt-row--sub' : '')
      }
    >
      {row.time ? (
        <span className="tt-time">{row.time}</span>
      ) : (
        <span className="tt-dot" aria-hidden="true">·</span>
      )}
      <span className="tt-label">{row.label}</span>
    </li>
  );
}

export default function EventTimetable({ timetable }: { timetable: Timetable }) {
  return (
    <div className="timetable glass">
      <ul className="tt-list">
        {timetable.entries.map((entry, i) => {
          if (isTimetableGroup(entry)) {
            return (
              <li className="tt-group" key={`g-${i}`}>
                <p className="tt-group__cat">{entry.category}</p>
                <ul className="tt-list tt-list--sub">
                  {entry.rows.map((r, j) => (
                    <Row row={r} sub key={`g-${i}-${j}`} />
                  ))}
                </ul>
              </li>
            );
          }
          return <Row row={entry} key={`r-${i}`} />;
        })}
      </ul>
    </div>
  );
}
