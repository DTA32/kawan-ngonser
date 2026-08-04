/**
 * Hand-built 2-day mini concert with engineered edge cases, in canonical form:
 *  - a/b: 1-minute overlap (conflict)
 *  - b/c: touching boundaries 21:00/21:00 (NOT a conflict)
 *  - d/e/f: 3-way transitive clash (d↔e, e↔f overlap; d/f do not)
 *  - late: 23:15 → 00:15 midnight spill, still dayIndex 1
 *  - d2: single performance on day 2
 * Times are Asia/Jakarta (+07:00).
 */
import type { Concert, Performance } from '~/domain/types'
import { parseVenueTime } from '~/domain/time'

export const TZ = 'Asia/Jakarta'

export function t(iso: string): number {
  const ms = parseVenueTime(iso, TZ)
  if (ms === null) throw new Error(`bad fixture time: ${iso}`)
  return ms
}

function perf(
  performanceId: string,
  dayIndex: number,
  stageId: string,
  start: string,
  end: string,
): Performance {
  return {
    performanceId,
    artistName: performanceId.toUpperCase(),
    artistImage: `https://img.example/${performanceId}.jpg`,
    dayIndex,
    stageId,
    startMs: t(start),
    endMs: t(end),
  }
}

export const P = {
  a: perf('a', 1, 's1', '2026-08-07T19:00:00', '2026-08-07T20:00:00'),
  b: perf('b', 1, 's2', '2026-08-07T19:59:00', '2026-08-07T21:00:00'),
  c: perf('c', 1, 's1', '2026-08-07T21:00:00', '2026-08-07T22:00:00'),
  d: perf('d', 1, 's1', '2026-08-07T15:00:00', '2026-08-07T16:00:00'),
  e: perf('e', 1, 's2', '2026-08-07T15:30:00', '2026-08-07T16:30:00'),
  f: perf('f', 1, 's3', '2026-08-07T16:15:00', '2026-08-07T17:00:00'),
  late: perf('late', 1, 's2', '2026-08-07T23:15:00', '2026-08-08T00:15:00'),
  d2solo: perf('d2solo', 2, 's1', '2026-08-08T20:00:00', '2026-08-08T21:00:00'),
} as const

export const miniConcert: Concert = {
  eventId: 'mini-fest-2026',
  version: 1,
  name: 'Mini Fest',
  logo: '',
  place: 'Test Grounds',
  description: 'Engineered edge cases',
  timezone: TZ,
  days: [
    { dayIndex: 1, date: '2026-08-07' },
    { dayIndex: 2, date: '2026-08-08' },
  ],
  stages: [
    { stageId: 's1', name: 'Stage One', color: '#E85D75' },
    { stageId: 's2', name: 'Stage Two', color: '#4CC3FF' },
    { stageId: 's3', name: 'Stage Three', color: '#3DDC97' },
  ],
  performances: Object.values(P).sort((x, y) => x.startMs - y.startMs),
}

/** The same concert in the §3.1 draft camelCase wire shape (naive times). */
export const miniDraftPayload = {
  id: miniConcert.eventId,
  version: miniConcert.version,
  name: miniConcert.name,
  logo: miniConcert.logo,
  place: miniConcert.place,
  description: miniConcert.description,
  timezone: TZ,
  days: miniConcert.days.map(d => ({ index: d.dayIndex, date: d.date })),
  stages: miniConcert.stages.map(s => ({ id: s.stageId, name: s.name, color: s.color })),
  performances: [
    { id: 'a', artistName: 'A', artistImage: '', dayIndex: 1, stageId: 's1', start: '2026-08-07T19:00:00', end: '2026-08-07T20:00:00' },
    { id: 'b', artistName: 'B', artistImage: '', dayIndex: 1, stageId: 's2', start: '2026-08-07T19:59:00', end: '2026-08-07T21:00:00' },
  ],
}
