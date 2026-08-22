import { describe, expect, it } from 'vitest'
import {
  type ConcertBuild,
  buildToConcert,
  buildToWirePayload,
  clashingPerformanceIds,
  createEmptyBuild,
  deriveEventIdOnRename,
  exportFilename,
  forkConcertToBuild,
  generateEventId,
  isPerformanceComplete,
  normalizeDays,
  readiness,
  resolveSetTimes,
  restampDay,
  sameStageClashes,
  slugify,
  spillsPastMidnight,
  stageIdFor,
  suggestEventId,
  timeOfIso,
} from '~/domain/builds'
import { formatVenueIso } from '~/domain/time'
import { miniConcert, TZ } from '../fixtures/mini'

/** Deterministic "random" so generated ids are assertable. */
function seededRand(seed = 1): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

function buildOf(patch: Partial<ConcertBuild> = {}): ConcertBuild {
  return {
    buildId: 'build-test',
    eventId: 'test-fest-aaaa',
    version: 1,
    name: 'Test Fest',
    logo: '',
    place: 'Somewhere',
    description: '',
    timezone: TZ,
    days: [{ dayIndex: 1, date: '2026-08-08' }],
    stages: [{ stageId: 'main', name: 'Main Stage', color: '#E85D75' }],
    performances: [],
    origin: 'scratch',
    forkedFromEventId: null,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  }
}

function perf(id: string, dayIndex: number, stageId: string, start: string, end: string) {
  return { performanceId: id, artistName: id.toUpperCase(), artistImage: '', dayIndex, stageId, start, end }
}

describe('slugify / event ids (B-11)', () => {
  it('slugs names into url-safe ids and strips diacritics', () => {
    expect(slugify('Bandung Berisík 2026!')).toBe('bandung-berisik-2026')
    expect(slugify('  ---Hello   World---  ')).toBe('hello-world')
    expect(slugify('!!!')).toBe('')
  })

  it('generates {slug}-{4} and never collides with a taken id', () => {
    const rand = seededRand()
    const first = generateEventId('Test Fest', new Set(), rand)
    expect(first).toMatch(/^test-fest-[a-z0-9]{4}$/)

    const second = generateEventId('Test Fest', new Set([first]), seededRand())
    expect(second).not.toBe(first)
  })

  it('falls back to a generic slug when the name has nothing usable', () => {
    expect(generateEventId('???', new Set(), seededRand())).toMatch(/^my-concert-[a-z0-9]{4}$/)
  })

  it('suggests the bare slug when free, a suffixed one when taken', () => {
    expect(suggestEventId('Night Market', new Set(), seededRand())).toBe('night-market')
    expect(suggestEventId('Night Market', new Set(['night-market']), seededRand()))
      .toMatch(/^night-market-[a-z0-9]{4}$/)
  })

  it('de-duplicates stage ids within a build', () => {
    expect(stageIdFor('Main Stage', new Set())).toBe('main-stage')
    expect(stageIdFor('Main Stage', new Set(['main-stage']))).toBe('main-stage-2')
    expect(stageIdFor('Main Stage', new Set(['main-stage', 'main-stage-2']))).toBe('main-stage-3')
  })
})

describe('set times (B-8)', () => {
  it('keeps start and end on the same date for an ordinary set', () => {
    expect(resolveSetTimes('2026-08-08', '19:00', '20:00')).toEqual({
      start: '2026-08-08T19:00:00',
      end: '2026-08-08T20:00:00',
    })
  })

  it('reads an end at or before the start as a past-midnight spill', () => {
    expect(resolveSetTimes('2026-08-08', '23:15', '00:15')).toEqual({
      start: '2026-08-08T23:15:00',
      end: '2026-08-09T00:15:00',
    })
    // exactly equal is a 24h set, not a zero-length one
    expect(resolveSetTimes('2026-08-08', '20:00', '20:00').end).toBe('2026-08-09T20:00:00')
  })

  it('flags spilled sets', () => {
    const spill = perf('late', 1, 'main', '2026-08-08T23:15:00', '2026-08-09T00:15:00')
    const normal = perf('early', 1, 'main', '2026-08-08T19:00:00', '2026-08-08T20:00:00')
    expect(spillsPastMidnight(spill)).toBe(true)
    expect(spillsPastMidnight(normal)).toBe(false)
  })

  it('re-stamps a day onto a new date, preserving wall time and spill', () => {
    const perfs = [
      perf('a', 1, 'main', '2026-08-08T19:00:00', '2026-08-08T20:00:00'),
      perf('late', 1, 'main', '2026-08-08T23:15:00', '2026-08-09T00:15:00'),
      perf('other', 2, 'main', '2026-08-09T19:00:00', '2026-08-09T20:00:00'),
    ]
    const out = restampDay(perfs, 1, '2026-09-05')
    expect(out[0]!.start).toBe('2026-09-05T19:00:00')
    expect(out[0]!.end).toBe('2026-09-05T20:00:00')
    expect(out[1]!.start).toBe('2026-09-05T23:15:00')
    expect(out[1]!.end).toBe('2026-09-06T00:15:00')
    // a different day is untouched
    expect(out[2]!.start).toBe('2026-08-09T19:00:00')
  })
})

describe('day renumbering (B-5)', () => {
  it('derives dayIndex from date order and drags performances along', () => {
    const build = buildOf({
      days: [
        { dayIndex: 1, date: '2026-08-10' },
        { dayIndex: 2, date: '2026-08-08' },
      ],
      performances: [
        perf('onLate', 1, 'main', '2026-08-10T19:00:00', '2026-08-10T20:00:00'),
        perf('onEarly', 2, 'main', '2026-08-08T19:00:00', '2026-08-08T20:00:00'),
      ],
    })
    const out = normalizeDays(build)
    expect(out.days).toEqual([
      { dayIndex: 1, date: '2026-08-08' },
      { dayIndex: 2, date: '2026-08-10' },
    ])
    // the 10th's set moved from index 1 to index 2, and vice versa
    expect(out.performances.find(p => p.performanceId === 'onLate')!.dayIndex).toBe(2)
    expect(out.performances.find(p => p.performanceId === 'onEarly')!.dayIndex).toBe(1)
  })

  it('closes the gap left by a removed middle day', () => {
    const build = buildOf({
      days: [
        { dayIndex: 1, date: '2026-08-08' },
        { dayIndex: 3, date: '2026-08-10' },
      ],
      performances: [perf('x', 3, 'main', '2026-08-10T19:00:00', '2026-08-10T20:00:00')],
    })
    const out = normalizeDays(build)
    expect(out.days.map(d => d.dayIndex)).toEqual([1, 2])
    expect(out.performances[0]!.dayIndex).toBe(2)
  })
})

describe('readiness (B-10)', () => {
  it('reports every gap on an empty build', () => {
    const empty = createEmptyBuild({ nowMs: 0, timezone: TZ, taken: new Set(), rand: seededRand() })
    const state = readiness(empty)
    expect(state.ready).toBe(false)
    expect(state.gaps).toEqual(['name', 'days', 'stages', 'performances'])
  })

  it('is ready once name, tz, a day, a stage and a valid set exist', () => {
    const build = buildOf({
      performances: [perf('a', 1, 'main', '2026-08-08T19:00:00', '2026-08-08T20:00:00')],
    })
    expect(readiness(build)).toEqual({ ready: true, gaps: [], incompleteCount: 0 })
  })

  it('counts sets that are missing an artist, a real day or a real stage', () => {
    const build = buildOf({
      performances: [
        { ...perf('noArtist', 1, 'main', '2026-08-08T19:00:00', '2026-08-08T20:00:00'), artistName: '  ' },
        perf('ghostStage', 1, 'nope', '2026-08-08T19:00:00', '2026-08-08T20:00:00'),
        perf('ghostDay', 9, 'main', '2026-08-08T19:00:00', '2026-08-08T20:00:00'),
        perf('fine', 1, 'main', '2026-08-08T21:00:00', '2026-08-08T22:00:00'),
      ],
    })
    const state = readiness(build)
    expect(state.ready).toBe(false)
    expect(state.gaps).toEqual(['incompleteSets'])
    expect(state.incompleteCount).toBe(3)
  })

  it('treats a spilled set as complete, not as a broken one', () => {
    const build = buildOf()
    const spill = perf('late', 1, 'main', '2026-08-08T23:15:00', '2026-08-09T00:15:00')
    expect(isPerformanceComplete(spill, build)).toBe(true)
  })
})

describe('same-stage clashes (B-7)', () => {
  it('flags two sets overlapping on ONE stage', () => {
    const build = buildOf({
      performances: [
        perf('a', 1, 'main', '2026-08-08T19:00:00', '2026-08-08T20:00:00'),
        perf('b', 1, 'main', '2026-08-08T19:30:00', '2026-08-08T20:30:00'),
      ],
    })
    expect(sameStageClashes(build)).toEqual([{ stageId: 'main', performanceIds: ['a', 'b'] }])
  })

  it('does NOT flag a cross-stage overlap — that is the app\'s whole point', () => {
    const build = buildOf({
      stages: [
        { stageId: 'main', name: 'Main', color: '#E85D75' },
        { stageId: 'bay', name: 'Bay', color: '#2FBF9B' },
      ],
      performances: [
        perf('a', 1, 'main', '2026-08-08T19:00:00', '2026-08-08T20:00:00'),
        perf('b', 1, 'bay', '2026-08-08T19:30:00', '2026-08-08T20:30:00'),
      ],
    })
    expect(sameStageClashes(build)).toEqual([])
    expect(clashingPerformanceIds(build).size).toBe(0)
  })

  it('does not flag back-to-back sets that merely touch', () => {
    const build = buildOf({
      performances: [
        perf('a', 1, 'main', '2026-08-08T19:00:00', '2026-08-08T20:00:00'),
        perf('b', 1, 'main', '2026-08-08T20:00:00', '2026-08-08T21:00:00'),
      ],
    })
    expect(sameStageClashes(build)).toEqual([])
  })

  it('catches an overlap that spans midnight on the same stage', () => {
    const build = buildOf({
      performances: [
        perf('late', 1, 'main', '2026-08-08T23:15:00', '2026-08-09T00:15:00'),
        perf('after', 1, 'main', '2026-08-08T23:45:00', '2026-08-09T00:45:00'),
      ],
    })
    expect(clashingPerformanceIds(build)).toEqual(new Set(['late', 'after']))
  })
})

describe('export (B-13)', () => {
  const build = buildOf({
    version: 7,
    performances: [
      perf('b', 1, 'main', '2026-08-08T21:00:00', '2026-08-08T22:00:00'),
      perf('a', 1, 'main', '2026-08-08T19:00:00', '2026-08-08T20:00:00'),
    ],
  })

  it('emits the §3.1 camelCase wire shape, sorted by start', () => {
    const wire = buildToWirePayload(build)
    expect(wire.id).toBe('test-fest-aaaa')
    expect(wire.days).toEqual([{ index: 1, date: '2026-08-08' }])
    expect(wire.stages).toEqual([{ id: 'main', name: 'Main Stage', color: '#E85D75' }])
    expect(wire.performances.map(p => p.id)).toEqual(['a', 'b'])
    expect(wire.performances[0]).toMatchObject({ dayIndex: 1, stageId: 'main', start: '2026-08-08T19:00:00' })
  })

  it('leaks no local bookkeeping fields', () => {
    const wire = buildToWirePayload(build) as Record<string, unknown>
    for (const local of ['buildId', 'origin', 'forkedFromEventId', 'createdAt', 'updatedAt']) {
      expect(wire).not.toHaveProperty(local)
    }
  })

  it('round-trips through the same parser an upload uses', () => {
    const result = buildToConcert(build)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.concert.eventId).toBe('test-fest-aaaa')
    expect(result.concert.performances).toHaveLength(2)
    // naive strings were interpreted in the venue zone, not the device zone
    expect(result.concert.performances[0]!.startMs).toBe(Date.parse('2026-08-08T19:00:00+07:00'))
  })

  it('names the file after the event id and version', () => {
    expect(exportFilename(build)).toBe('test-fest-aaaa-v7.json')
  })
})

describe('fork (B-15)', () => {
  it('copies the concert data under a fresh id at version 1', () => {
    const fork = forkConcertToBuild(miniConcert, {
      nowMs: 1000,
      taken: new Set([miniConcert.eventId]),
      rand: seededRand(),
      toIso: formatVenueIso,
    })
    expect(fork.eventId).not.toBe(miniConcert.eventId)
    expect(fork.version).toBe(1)
    expect(fork.origin).toBe('forked')
    expect(fork.forkedFromEventId).toBe(miniConcert.eventId)
    expect(fork.days).toHaveLength(miniConcert.days.length)
    expect(fork.stages).toHaveLength(miniConcert.stages.length)
    expect(fork.performances).toHaveLength(miniConcert.performances.length)
  })

  it('converts epoch ms back to naive venue-local wall time', () => {
    const fork = forkConcertToBuild(miniConcert, {
      nowMs: 0, taken: new Set(), rand: seededRand(), toIso: formatVenueIso,
    })
    const late = fork.performances.find(p => p.performanceId === 'late')!
    expect(late.start).toBe('2026-08-07T23:15:00')
    // the midnight spill survives the round trip
    expect(late.end).toBe('2026-08-08T00:15:00')
    expect(timeOfIso(late.end)).toBe('00:15')
  })

  it('produces a build that exports back to a plannable concert', () => {
    const fork = forkConcertToBuild(miniConcert, {
      nowMs: 0, taken: new Set(), rand: seededRand(), toIso: formatVenueIso,
    })
    const result = buildToConcert(fork)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // same schedule, different identity
    expect(result.concert.performances.map(p => p.startMs))
      .toEqual(miniConcert.performances.map(p => p.startMs))
    expect(result.concert.eventId).not.toBe(miniConcert.eventId)
  })
})

describe('event id follows the name until the user takes it over (B-11)', () => {
  it('re-derives from the name while the id is still auto-generated', () => {
    // B-1 creates an unnamed build → my-concert-xxxx
    const initial = generateEventId('', new Set(), seededRand())
    expect(initial).toMatch(/^my-concert-[a-z0-9]{4}$/)

    const named = deriveEventIdOnRename(initial, '', 'Bandung Berisik 2026', new Set())
    expect(named).toBe(`bandung-berisik-2026-${initial.slice(-4)}`)
  })

  it('keeps following further renames, preserving the suffix', () => {
    const next = deriveEventIdOnRename('bandung-berisik-2026-ab12', 'Bandung Berisik 2026', 'Bandung Berisik 2027', new Set())
    expect(next).toBe('bandung-berisik-2027-ab12')
  })

  it('stops the moment the user hand-edits the id', () => {
    const custom = 'my-own-id'
    expect(deriveEventIdOnRename(custom, 'Bandung Berisik 2026', 'Something Else', new Set())).toBe(custom)
  })

  it('does not churn when the slug is unchanged', () => {
    const id = 'test-fest-ab12'
    expect(deriveEventIdOnRename(id, 'Test Fest', 'Test  Fest!', new Set())).toBe(id)
  })

  it('avoids a collision with an id already on the device', () => {
    const taken = new Set(['bandung-berisik-2026-ab12'])
    const out = deriveEventIdOnRename('my-concert-ab12', '', 'Bandung Berisik 2026', taken, seededRand())
    expect(out).not.toBe('bandung-berisik-2026-ab12')
    expect(out).toMatch(/^bandung-berisik-2026-[a-z0-9]{4}$/)
  })
})
