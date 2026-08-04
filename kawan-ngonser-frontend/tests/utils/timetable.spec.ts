import { describe, expect, it } from 'vitest'
import { buildEffectiveSchedule } from '~/domain/schedule'
import type { CustomEvent, PickMap } from '~/domain/types'
import { buildTimetableModel, type SlotNode } from '~/utils/timetable'
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

// Day-1 fixture times: d 15:00–16:00, e 15:30–16:30, f 16:15–17:00,
// a 19:00–20:00, b 19:59–21:00, c 21:00–22:00, late 23:15–00:15
const allPicked = picksOf([
  ['d', 'preferred'], ['e', 'backburner'], ['f', 'preferred'],
  ['a', 'preferred'], ['b', 'backburner'], ['c', 'preferred'], ['late', 'preferred'],
])

function slotIds(node: SlotNode): string[] {
  return node.rows.flat().map(c =>
    c.entry.kind === 'performance' ? c.entry.performance.performanceId : c.entry.event.customEventId)
}

describe('buildTimetableModel — content + clustering', () => {
  it('shows only preferred + backburner + custom entries', () => {
    const model = buildTimetableModel({
      entries: day1Entries(),
      picks: picksOf([['a', 'preferred'], ['b', 'backburner'], ['c', 'skipped']]),
      pref: 'equal',
      nowMs: t('2026-08-07T14:00:00'),
      mode: 'today',
    })
    const ids = model.visible.concat(model.later)
      .filter((n): n is SlotNode => n.type === 'slot')
      .flatMap(slotIds)
    expect(ids.sort()).toEqual(['a', 'b']) // c skipped, others unpicked
  })

  it('clusters overlapping picks into one slot with preferred first', () => {
    const model = buildTimetableModel({
      entries: day1Entries(),
      picks: picksOf([['a', 'preferred'], ['b', 'backburner']]),
      pref: 'equal',
      nowMs: t('2026-08-07T18:30:00'),
      mode: 'today',
    })
    const slot = model.visible.find(n => n.type === 'slot') as SlotNode
    expect(slot.rows).toHaveLength(1)
    expect(slot.rows[0]!.map(c => c.role)).toEqual(['preferred', 'backburner'])
    expect(slot.labelMs).toBe(t('2026-08-07T19:00:00'))
  })

  it('hidden pref drops backburner entries entirely (they stay in W-3)', () => {
    const model = buildTimetableModel({
      entries: day1Entries(),
      picks: picksOf([['a', 'preferred'], ['b', 'backburner']]),
      pref: 'hidden',
      nowMs: t('2026-08-07T18:30:00'),
      mode: 'today',
    })
    const slot = model.visible.find(n => n.type === 'slot') as SlotNode
    expect(slot.rows[0]).toHaveLength(1)
    expect(slotIds(slot)).toEqual(['a'])
  })

  it('chunks a 4-way pileup into rows of ≤3', () => {
    const events: CustomEvent[] = [
      { customEventId: 'x', name: 'Merch run', startMs: t('2026-08-07T15:15:00'), endMs: t('2026-08-07T16:45:00') },
    ]
    const model = buildTimetableModel({
      entries: day1Entries(events),
      picks: picksOf([['d', 'preferred'], ['e', 'backburner'], ['f', 'preferred']]),
      pref: 'equal',
      nowMs: t('2026-08-07T14:00:00'),
      mode: 'today',
    })
    const slot = model.visible.find(n => n.type === 'slot') as SlotNode
    expect(slot.rows).toHaveLength(2)
    expect(slot.rows[0]).toHaveLength(3)
    expect(slot.rows[1]).toHaveLength(1)
  })
})

describe('buildTimetableModel — past / window / gaps', () => {
  it('collapses fully-ended clusters and counts played sets', () => {
    const model = buildTimetableModel({
      entries: day1Entries(),
      picks: allPicked,
      pref: 'equal',
      nowMs: t('2026-08-07T18:00:00'), // d/e/f done, a onward upcoming
      mode: 'today',
    })
    expect(model.past).toHaveLength(1)
    expect(model.pastSetCount).toBe(3)
    const firstVisible = model.visible.find(n => n.type === 'slot') as SlotNode
    expect(slotIds(firstVisible).sort()).toEqual(['a', 'b'])
  })

  it('keeps a half-finished cluster visible', () => {
    const model = buildTimetableModel({
      entries: day1Entries(),
      picks: allPicked,
      pref: 'equal',
      nowMs: t('2026-08-07T16:10:00'), // d done, e/f still running
      mode: 'today',
    })
    expect(model.past).toHaveLength(0)
    const first = model.visible.find(n => n.type === 'slot') as SlotNode
    expect(slotIds(first).sort()).toEqual(['d', 'e', 'f'])
  })

  it('pushes clusters beyond the forward window behind "later"', () => {
    const model = buildTimetableModel({
      entries: day1Entries(),
      picks: allPicked,
      pref: 'equal',
      nowMs: t('2026-08-07T18:00:00'), // horizon 21:00 → late (23:15) is later
      mode: 'today',
    })
    const laterSlots = model.later.filter((n): n is SlotNode => n.type === 'slot')
    expect(laterSlots.flatMap(slotIds)).toContain('late')
    const visibleIds = model.visible.filter((n): n is SlotNode => n.type === 'slot').flatMap(slotIds)
    expect(visibleIds).not.toContain('late')
  })

  it('inserts a gap node for breaks of ≥25 minutes', () => {
    const model = buildTimetableModel({
      entries: day1Entries(),
      picks: allPicked,
      pref: 'equal',
      nowMs: t('2026-08-07T14:00:00'),
      mode: 'preview',
    })
    // 17:00 (f ends) → 19:00 (a starts): 2h gap
    const gaps = model.visible.filter(n => n.type === 'gap')
    expect(gaps.length).toBeGreaterThanOrEqual(2) // 17:00→19:00 and 22:00→23:15
    expect(gaps[0]).toMatchObject({ prefillMs: t('2026-08-07T17:00:00') })
  })

  it('does not insert a gap for the 1-hour-boundary b→c handoff', () => {
    const model = buildTimetableModel({
      entries: day1Entries(),
      picks: picksOf([['b', 'preferred'], ['c', 'preferred']]),
      pref: 'equal',
      nowMs: t('2026-08-07T19:30:00'),
      mode: 'today',
    })
    // b ends 21:00, c starts 21:00 — no gap
    expect(model.visible.filter(n => n.type === 'gap')).toHaveLength(0)
  })

  it('preview mode: nothing is past, everything visible', () => {
    const model = buildTimetableModel({
      entries: day1Entries(),
      picks: allPicked,
      pref: 'equal',
      nowMs: t('2026-08-07T23:59:00'),
      mode: 'preview',
    })
    expect(model.past).toHaveLength(0)
    expect(model.later).toHaveLength(0)
    const ids = model.visible.filter((n): n is SlotNode => n.type === 'slot').flatMap(slotIds)
    expect(ids).toContain('d')
    expect(ids).toContain('late')
  })
})
