// Programmes horaires (timetable) par édition — clé = slug de l'édition.
//
// Deux formats acceptés dans `entries`, mélangeables dans une même timetable :
//   - ligne simple  : { time?, label, strong? }      (liste plate)
//   - groupe        : { category, rows: TimetableRow[] }  (sous-liste par catégorie)
//
// `time` est optionnel : certains créneaux n'ont pas d'heure sur le flyer source,
// on affiche alors juste l'ordre de passage (règle : on n'invente pas d'horaire).
// `strong` = moment clé (ouverture / fermeture des portes, fin de l'événement).

export interface TimetableRow {
  time?: string;
  label: string;
  strong?: boolean;
}

export interface TimetableGroup {
  category: string;
  rows: TimetableRow[];
}

export type TimetableEntry = TimetableRow | TimetableGroup;

export interface Timetable {
  entries: TimetableEntry[];
}

export function isTimetableGroup(entry: TimetableEntry): entry is TimetableGroup {
  return 'category' in entry;
}

export const timetables: Record<string, Timetable> = {
  'candy-land': {
    entries: [
      { time: '16:00', label: 'Ouverture des portes', strong: true },
      { time: '16:00', label: 'DJ Sosonne · DJ Dalton · DJ LK' },
      { time: '16:45', label: 'DJ Yoyo' },
      { time: '17:00', label: 'DJ Tchambou' },
      { time: '18:00', label: 'DJ Syxtee' },
      { time: '18:30', label: 'Fermeture des portes', strong: true },
      { time: '19:00', label: 'DJ Buz' },
      { time: '20:20', label: 'Timalash & Lil Scott' },
    ],
  },

  'la-xploz-tropical-island': {
    entries: [
      { time: '16:00', label: 'Ouverture des portes', strong: true },
      { label: 'DJ Doms · DJ Sosonne' },
      { label: 'DJ Mano' },
      { label: 'DJ Tomtom' },
      { label: 'DJ Jicypie' },
      { label: 'Fermeture des portes', strong: true },
      { label: 'Lulux' },
      { label: 'Lms' },
      { label: 'Latop' },
      { time: '22:00', label: "Fin de l'événement", strong: true },
    ],
  },

  'edition-picasso': {
    entries: [
      { time: '16:00', label: 'Ouverture des portes', strong: true },
      { time: '16:00', label: 'DJ Dyxonn' },
      { time: '16:30', label: 'DJ Cheek' },
      { time: '17:00', label: 'DJ Wiixx' },
      { time: '18:00', label: 'DJ Buz' },
      { time: '18:30', label: 'Fermeture des portes', strong: true },
      { time: '19:00', label: 'DJ Syxtee x DJ Dreezy' },
      { time: '20:00', label: 'Lulux' },
      { time: '20:05', label: 'Dega Youth' },
      { time: '20:10', label: 'Jeune Aber' },
    ],
  },

  'welcome-to-dominica': {
    entries: [
      { time: '16:00–18:30', label: 'Ouverture des portes', strong: true },
      {
        category: 'Warmup',
        rows: [
          { time: '16:00–17:00', label: 'Buz' },
          { time: '17:00–18:00', label: 'Ayou — Tchambou' },
        ],
      },
      { time: '18:00–21:00', label: 'Fermeture des portes', strong: true },
      {
        category: 'Show DJ',
        rows: [
          { time: '18:00–19:00', label: 'Syxtee' },
          { time: '19:00–20:00', label: 'Doms' },
          { time: '20:00–21:00', label: 'Wiixx' },
        ],
      },
      {
        category: 'Showcase',
        rows: [{ time: '20:20–20:30', label: 'Dreezy Keyboard Show' }],
      },
      { time: '21:30', label: 'Fin des festivités', strong: true },
    ],
  },
};

export function getTimetable(slug: string): Timetable | undefined {
  return timetables[slug];
}
