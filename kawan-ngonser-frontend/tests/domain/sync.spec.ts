import { describe, expect, it } from 'vitest'
import { revalidatePlan } from '~/domain/sync'
import type { Concert, PickMap } from '~/domain/types'
import { miniConcert, P, t } from '../fixtures/mini'

function picksOf(entries: Array<[string, 'preferred' | 'backburner' | 'skipped']>): PickMap {
  return Object.fromEntries(entries.map(([id, status]) => [
    id,
    { performanceId: id, status, notifyOptIn: false },
  ]))
}

function concertWithout(...ids: string[]): Concert {
  return {
    ...miniConcert,
    version: miniConcert.version + 1,
    performances: miniConcert.performances.filter(p => !ids.includes(p.performanceId)),
  }
}

describe('revalidatePlan (F-1)', () => {
  it('drops picks whose performances vanished and reports them', () => {
    const r = revalidatePlan({
      newConcert: concertWithout('a'),
      attendingDayIndexes: [1, 2],
      picks: picksOf([['a', 'preferred'], ['c', 'preferred']]),
    })
    expect(r.picks.a).toBeUndefined()
    expect(r.picks.c!.status).toBe('preferred')
    expect(r.report.droppedPerformanceIds).toEqual(['a'])
  })

  it('auto-promotes a backburner whose preferred counterpart vanished', () => {
    const r = revalidatePlan({
      newConcert: concertWithout('a'),
      attendingDayIndexes: [1],
      picks: picksOf([['a', 'preferred'], ['b', 'backburner']]),
    })
    expect(r.picks.b!.status).toBe('preferred')
    expect(r.report.promotedPerformanceIds).toEqual(['b'])
    expect(r.pendingConflicts).toEqual([])
  })

  it('auto-promotes a backburner whose conflict dissolved via a time change', () => {
    // b moves to 21:30–22:30 — no longer overlaps a
    const moved: Concert = {
      ...miniConcert,
      performances: miniConcert.performances.map(p =>
        p.performanceId === 'b'
          ? { ...p, startMs: t('2026-08-07T21:30:00'), endMs: t('2026-08-07T22:30:00') }
          : p),
    }
    const r = revalidatePlan({
      newConcert: moved,
      attendingDayIndexes: [1],
      picks: picksOf([['a', 'preferred'], ['b', 'backburner']]),
    })
    expect(r.picks.b!.status).toBe('preferred')
  })

  it('re-triggers O-4 when changed times create a new preferred clash', () => {
    // c moves onto a's slot — two preferred now overlap
    const moved: Concert = {
      ...miniConcert,
      performances: miniConcert.performances.map(p =>
        p.performanceId === 'c'
          ? { ...p, startMs: P.a.startMs, endMs: P.a.endMs }
          : p),
    }
    const r = revalidatePlan({
      newConcert: moved,
      attendingDayIndexes: [1],
      picks: picksOf([['a', 'preferred'], ['c', 'preferred']]),
    })
    expect(r.pendingConflicts).toHaveLength(1)
    expect(r.pendingConflicts[0]!.performanceIds.sort()).toEqual(['a', 'c'])
    expect(r.report.conflictsToResolve).toBe(1)
  })

  it('clamps attending days that no longer exist', () => {
    const oneDay: Concert = {
      ...miniConcert,
      days: [miniConcert.days[0]!],
      performances: miniConcert.performances.filter(p => p.dayIndex === 1),
    }
    const r = revalidatePlan({
      newConcert: oneDay,
      attendingDayIndexes: [1, 2],
      picks: picksOf([['a', 'preferred'], ['d2solo', 'preferred']]),
    })
    expect(r.attendingDayIndexes).toEqual([1])
    expect(r.report.removedDayIndexes).toEqual([2])
    expect(r.report.droppedPerformanceIds).toEqual(['d2solo'])
  })

  it('keeps skipped picks skipped while their performance survives', () => {
    const r = revalidatePlan({
      newConcert: { ...miniConcert, version: 2 },
      attendingDayIndexes: [1],
      picks: picksOf([['a', 'skipped'], ['b', 'backburner']]),
    })
    expect(r.picks.a!.status).toBe('skipped')
    // a is skipped (not preferred) → b's conflict dissolved → promoted
    expect(r.picks.b!.status).toBe('preferred')
  })
})
