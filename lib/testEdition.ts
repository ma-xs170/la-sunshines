// Événement éditorial de TEST « test-billetterie », défini dans le CODE (et non dans data/content.json).
//
// Pourquoi : la billetterie (Supabase, partagée entre ton ordinateur et la production) est rattachée à un événement
// éditorial par son slug. Un événement de test créé dans data/content.json n'existe que comme modification LOCALE non
// commitée : un `git reset` / `git stash` / changement de branche, ou tout simplement la production (dont le
// content.json ne l'a pas), le fait « disparaître » → « événement éditorial introuvable ».
// Ici il est fourni par le code, uniquement quand le mode de test est actif (TICKETING_FORCE_MODE=internal, hors production) :
//  * il survit aux opérations git ; * il n'existe JAMAIS en production (aucune page publique, aucun tarif visible).
// Un événement de même slug présent dans data/content.json a priorité.

import type { StoredEvent } from './store';

export const TEST_EDITION_SLUG = 'test-billetterie';

/** Date d'événement toujours à venir (dans 60 jours) : la page reste « prochaine édition ». */
function futureDate(now: number): string {
  return new Date(now + 60 * 86_400_000).toISOString().slice(0, 10);
}

export function testStoredEvent(now = Date.now()): StoredEvent {
  return {
    id: 'test-billetterie-code',
    slug: TEST_EDITION_SLUG,
    name: 'TEST Billetterie',
    date: futureDate(now),
    time: '20h00',
    description: 'Soirée de test interne — ne pas publier.',
    venue: 'Salle de test',
    dresscode: 'Libre',
    headliner: '',
    lineup: [],
    bizoukEmbed: '',
    flyer: '',
    flyerW: 0,
    flyerH: 0,
    dominantColor: null,
    palette: [],
    gradient: 'linear-gradient(140deg, #524460 0%, #3a2a4a 45%, #201729 100%)',
    emoji: '🎟️',
    hidden: false,
    archived: false,
    schedule: [],
    createdAt: '2026-09-20T00:00:00.000Z',
  };
}

/** Événements « stockés » + l'événement de test du code, si le mode de test est actif et si content.json n'en définit pas déjà un. */
export function withTestEvent(events: StoredEvent[], enabled: boolean, now = Date.now()): StoredEvent[] {
  // `enabled` = testEditionEnabled(process.env) (lib/ticketing/force-mode.ts) : mode de test actif ET hors production
  if (!enabled || events.some((e) => e.slug === TEST_EDITION_SLUG)) return events;
  return [...events, testStoredEvent(now)];
}
