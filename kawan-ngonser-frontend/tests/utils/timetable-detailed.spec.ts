import { describe, expect, it } from 'vitest'
import { buildEffectiveSchedule } from '~/domain/schedule'
import type { CustomEvent, PickMap, ScheduleEntry } from '~/domain/types'
import { HOUR_PX, buildDetailedModel, timeAtOffset } from '~/utils/timetable-detailed'
import { miniConcert, t } from '../fixtures/mini'

function picksOf(entries: Array<[string, 'preferred' | 'backburner' | 'skipped']>): PickMap {
  return Object.fromEntries(entries.map(([id, status]) => [
    id,
    { performanceId: id, status, notifyOptIn: false },
  ]))
}

function day1Entries(customEvents: CustomEvent[] = []) {
  return buildEffectiveSchedule(miniConcert, {}, customEvents).byDay.get(1)!
}

/** Synthetic entries for geometry cases the fixture doesn't cover. */
function perfEntry(id: string, start: string, end: string): ScheduleEntry {
  const startMs = t(start)
  const endMs = t(end)
  return {
    kind: 'performance',
    startMs,
    endMs,
    dayIndex: 1,
    performance: {
      performanceId: id,
      artistName: id.toUpperCase(),
      artistImage: '',
      dayIndex: 1,
      stageId: 's1',
      startMs,
      endMs,
      overridden: false,
    },
  }
}

function customEntry(id: string, start: string, end: string): ScheduleEntry {
  const startMs = t(start)
  const endMs = t(end)
  return {
    kind: 'custom',
    startMs,
    endMs,
    dayIndex: 1,
    event: { customEventId: id, name: id, startMs, endMs },
  }
}

function allPreferred(...ids: string[]): PickMap {
  return picksOf(ids.map(id => [id, 'preferred']))
}

function build(entries: ScheduleEntry[], over: Partial<Parameters<typeof buildDetailedModel>[0]> = {}) {
  return buildDetailedModel({
    entries,
    picks: allPreferred(...entries.flatMap(e =>
      e.kind === 'performance' ? [e.performance.performanceId] : [])),
    pref: 'equal',
    nowMs: t('2026-08-07T19:02:00'),
    phase: 'future',
    ...over,
  })
}

function idOf(entry: ScheduleEntry): string {
  return entry.kind === 'performance' ? entry.performance.performanceId : entry.event.customEventId
}

// Day-1 fixture: d 15:00–16:00, e 15:30–16:30, f 16:15–17:00,
// a 19:00–20:00, b 19:59–21:00, c 21:00–22:00, late 23:15–00:15

describe('buildDetailedModel — canvas window', () => {
  it('snaps the window out to whole hours around the content', () => {
    const model = build([perfEntry('x', '2026-08-07T19:15:00', '2026-08-07T20:45:00')])
    expect(model.startMs).toBe(t('2026-08-07T19:00:00'))
    expect(model.endMs).toBe(t('2026-08-07T21:00:00'))
    expect(model.height).toBe(2 * HOUR_PX)
  })

  it('stretches the window to include now, on today only', () => {
    const model = build(
      [perfEntry('x', '2026-08-07T19:00:00', '2026-08-07T20:00:00')],
      { phase: 'today', nowMs: t('2026-08-07T17:30:00') },
    )
    expect(model.startMs).toBe(t('2026-08-07T17:00:00'))
    expect(model.height).toBe(3 * HOUR_PX)
  })

  it('falls back to the day window when nothing is planned', () => {
    const window: [number, number] = [t('2026-08-07T00:00:00'), t('2026-08-08T00:00:00')]
    const model = build([], { dayWindow: window })
    expect(model.startMs).toBe(window[0])
    expect(model.endMs).toBe(window[1])
    expect(model.blocks).toEqual([])
  })

  it('emits one hour line per boundary, inclusive', () => {
    const model = build([perfEntry('x', '2026-08-07T19:00:00', '2026-08-07T22:00:00')])
    expect(model.hours.map(h => h.top)).toEqual([0, 64, 128, 192])
  })
})

describe('buildDetailedModel — block geometry', () => {
  it('positions and sizes blocks proportionally to real time', () => {
    const model = build(
      [perfEntry('x', '2026-08-07T19:30:00', '2026-08-07T20:15:00')],
      { phase: 'today', nowMs: t('2026-08-07T19:00:00') },
    )
    // window starts 19:00 → 30 min down, 45 min tall
    expect(model.blocks[0]!.top).toBe(32)
    expect(model.blocks[0]!.height).toBe(48)
  })

  it('clamps very short entries to a tappable minimum height', () => {
    const model = build([customEntry('quick', '2026-08-07T19:00:00', '2026-08-07T19:10:00')])
    // 10 min would be ~10.7px
    expect(model.blocks[0]!.height).toBe(22)
  })

  it('gives a lone entry the full content width', () => {
    const model = build([perfEntry('c', '2026-08-07T21:00:00', '2026-08-07T22:00:00')])
    expect(model.blocks[0]!.left).toBe(0)
    expect(model.blocks[0]!.width).toBe(1)
  })

  it('flags entries that have already ended', () => {
    const model = build(
      [perfEntry('x', '2026-08-07T19:00:00', '2026-08-07T20:00:00')],
      { phase: 'today', nowMs: t('2026-08-07T21:00:00') },
    )
    expect(model.blocks[0]!.past).toBe(true)
  })

  it('dims a whole day that is over, without stretching the canvas to now', () => {
    const model = build(
      [perfEntry('x', '2026-08-07T19:00:00', '2026-08-07T20:00:00')],
      { phase: 'past', nowMs: t('2026-08-09T12:00:00') },
    )
    expect(model.blocks.every(b => b.past)).toBe(true)
    expect(model.nowTop).toBeNull()
    expect(model.hours.some(h => h.suppressed)).toBe(false)
    // The canvas stays on the day's own hours — not Aug 7 → Aug 9.
    expect(model.endMs).toBe(t('2026-08-07T20:00:00'))
  })

  it('leaves a day still ahead unflagged', () => {
    const model = build(
      [perfEntry('x', '2026-08-08T19:00:00', '2026-08-08T20:00:00')],
      { phase: 'future', nowMs: t('2026-08-07T19:02:00') },
    )
    expect(model.blocks.every(b => b.past)).toBe(false)
  })
})

describe('buildDetailedModel — lane packing', () => {
  it('splits a two-way overlap 50/50', () => {
    const model = build(day1Entries(), {
      picks: picksOf([['a', 'preferred'], ['b', 'preferred']]),
    })
    const [a, b] = model.blocks
    expect(a!.left).toBe(0)
    expect(a!.width).toBe(0.5)
    expect(b!.left).toBe(0.5)
    expect(b!.width).toBe(0.5)
  })

  it('reuses a freed lane instead of adding one — the whole point of this view', () => {
    // d/e/f is a 3-way transitive clash, but f starts after d ends (16:15 > 16:00),
    // so it drops back into d's lane: 2 lanes, not the compact view's flat 33/33/33.
    const model = build(day1Entries(), {
      picks: picksOf([['d', 'preferred'], ['e', 'preferred'], ['f', 'preferred']]),
    })
    const byId = Object.fromEntries(model.blocks.map(b => [idOf(b.entry), b]))
    expect(byId.d!.left).toBe(0)
    expect(byId.e!.left).toBe(0.5)
    expect(byId.f!.left).toBe(0)
    expect(model.blocks.every(b => b.width === 0.5)).toBe(true)
  })

  it('matches the design scene: Tulus / Barasuara / Dinner break in 2 lanes', () => {
    const entries = [
      perfEntry('tulus', '2026-08-07T20:00:00', '2026-08-07T21:00:00'),
      perfEntry('barasuara', '2026-08-07T20:30:00', '2026-08-07T21:30:00'),
      customEntry('dinner', '2026-08-07T21:00:00', '2026-08-07T21:30:00'),
    ]
    const model = buildDetailedModel({
      entries,
      picks: picksOf([['tulus', 'preferred'], ['barasuara', 'backburner']]),
      pref: 'equal',
      nowMs: t('2026-08-07T19:02:00'),
      phase: 'today',
    })
    const byId = Object.fromEntries(model.blocks.map(b => [idOf(b.entry), b]))
    expect(byId.tulus!).toMatchObject({ left: 0, width: 0.5, density: 'full' })
    expect(byId.barasuara!).toMatchObject({ left: 0.5, width: 0.5, role: 'backburner' })
    expect(byId.dinner!).toMatchObject({ left: 0, width: 0.5, density: 'tight' })
  })

  it('widens a block across an adjacent lane it does not clash with', () => {
    const model = build([
      perfEntry('long', '2026-08-07T19:00:00', '2026-08-07T21:00:00'),
      perfEntry('early', '2026-08-07T19:10:00', '2026-08-07T19:30:00'),
      perfEntry('third', '2026-08-07T19:20:00', '2026-08-07T19:40:00'),
      perfEntry('later', '2026-08-07T20:00:00', '2026-08-07T20:30:00'),
    ])
    const byId = Object.fromEntries(model.blocks.map(b => [idOf(b.entry), b]))
    // three lanes exist, but `later` clashes with nothing in lane 2 → spans both
    expect(byId.third!.left).toBeCloseTo(2 / 3)
    expect(byId.later!.left).toBeCloseTo(1 / 3)
    expect(byId.later!.width).toBeCloseTo(2 / 3)
    expect(byId.long!.width).toBeCloseTo(1 / 3)
  })

  it('keeps touching boundaries out of the same lane split', () => {
    // b ends 21:00, c starts 21:00 — not a conflict, so both are full width
    const model = build(day1Entries(), {
      picks: picksOf([['b', 'preferred'], ['c', 'preferred']]),
    })
    expect(model.blocks.every(blk => blk.width === 1)).toBe(true)
  })
})

describe('buildDetailedModel — content filter', () => {
  it('shows only preferred + backburner + custom entries', () => {
    const model = build(day1Entries(), {
      picks: picksOf([['a', 'preferred'], ['b', 'backburner'], ['c', 'skipped']]),
    })
    expect(model.blocks.map(b => idOf(b.entry)).sort()).toEqual(['a', 'b'])
  })

  it('hidden pref drops backburner entries entirely', () => {
    const model = build(day1Entries(), {
      picks: picksOf([['a', 'preferred'], ['b', 'backburner']]),
      pref: 'hidden',
    })
    expect(model.blocks.map(b => idOf(b.entry))).toEqual(['a'])
  })

  it('includes custom events alongside picks', () => {
    const entries = day1Entries([
      { customEventId: 'break', name: 'Dinner', startMs: t('2026-08-07T20:15:00'), endMs: t('2026-08-07T20:45:00') },
    ])
    const model = build(entries, { picks: picksOf([['a', 'preferred']]) })
    expect(model.blocks.map(b => idOf(b.entry)).sort()).toEqual(['a', 'break'])
  })
})

describe('buildDetailedModel — density + now line', () => {
  it.each([
    ['2026-08-07T20:00:00', 'full'],
    ['2026-08-07T19:52:30', 'full'], // 52.5 min → exactly 56px
    ['2026-08-07T19:45:00', 'medium'],
    ['2026-08-07T19:37:30', 'medium'], // 37.5 min → exactly 40px
    ['2026-08-07T19:30:00', 'tight'],
  ])('degrades block content by height (ends %s → %s)', (end, density) => {
    const model = build([perfEntry('x', '2026-08-07T19:00:00', end)])
    expect(model.blocks[0]!.density).toBe(density)
  })

  it('places the now line and suppresses the hour label it sits on', () => {
    const model = build(
      [perfEntry('x', '2026-08-07T19:15:00', '2026-08-07T20:00:00')],
      { phase: 'today', nowMs: t('2026-08-07T19:02:00') },
    )
    expect(model.nowTop).toBeCloseTo(2 * (HOUR_PX / 60))
    expect(model.hours.find(h => h.labelMs === t('2026-08-07T19:00:00'))!.suppressed).toBe(true)
    expect(model.hours.find(h => h.labelMs === t('2026-08-07T20:00:00'))!.suppressed).toBe(false)
  })

  it('has no now line when previewing another day', () => {
    const model = build([perfEntry('x', '2026-08-08T19:00:00', '2026-08-08T20:00:00')])
    expect(model.nowTop).toBeNull()
  })
})

describe('timeAtOffset', () => {
  it('maps a tap on empty canvas to a 5-minute slot', () => {
    const model = build([perfEntry('x', '2026-08-07T19:00:00', '2026-08-07T21:00:00')])
    // 100px down at 64px/hour ≈ 93.75 min → rounds to 19:95 → 20:35
    expect(timeAtOffset(model, 100)).toBe(t('2026-08-07T20:35:00'))
    expect(timeAtOffset(model, 0)).toBe(t('2026-08-07T19:00:00'))
  })
})
