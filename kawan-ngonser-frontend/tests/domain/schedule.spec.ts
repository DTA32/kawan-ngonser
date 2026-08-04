import { describe, expect, it } from 'vitest'
import { buildEffectiveSchedule } from '~/domain/schedule'
import { makeRemoval } from '~/domain/overrides'
import type { CustomEvent } from '~/domain/types'
import { miniConcert, t } from '../fixtures/mini'

describe('buildEffectiveSchedule', () => {
  it('groups sorted entries per day', () => {
    const s = buildEffectiveSchedule(miniConcert, {}, [])
    const day1 = s.byDay.get(1)!
    expect(day1.map(e => e.startMs)).toEqual([...day1.map(e => e.startMs)].sort((a, b) => a - b))
    expect(s.byDay.get(2)!).toHaveLength(1)
  })

  it('keeps the 23:15→00:15 midnight spill inside day 1\'s window', () => {
    const s = buildEffectiveSchedule(miniConcert, {}, [])
    const [start, end] = s.dayWindows.get(1)!
    expect(start).toBe(t('2026-08-07T00:00:00'))
    expect(end).toBe(t('2026-08-08T00:15:00')) // spill set extends past midnight
    const day1Ids = s.byDay.get(1)!.filter(e => e.kind === 'performance').map(e => e.performance.performanceId)
    expect(day1Ids).toContain('late')
  })

  it('applies overrides before building', () => {
    const s = buildEffectiveSchedule(miniConcert, { a: makeRemoval('a') }, [])
    const ids = s.performances.map(p => p.performanceId)
    expect(ids).not.toContain('a')
  })

  it('assigns a custom event during the spill to day 1, and after it to day 2', () => {
    const events: CustomEvent[] = [
      { customEventId: 'x1', name: 'Late snack', startMs: t('2026-08-07T23:50:00'), endMs: null },
      { customEventId: 'x2', name: 'Breakfast', startMs: t('2026-08-08T09:00:00'), endMs: null },
    ]
    const s = buildEffectiveSchedule(miniConcert, {}, events)
    const day1Customs = s.byDay.get(1)!.filter(e => e.kind === 'custom').map(e => e.event.customEventId)
    const day2Customs = s.byDay.get(2)!.filter(e => e.kind === 'custom').map(e => e.event.customEventId)
    expect(day1Customs).toEqual(['x1'])
    expect(day2Customs).toEqual(['x2'])
  })

  it('gives open-ended custom events a default 30-min block', () => {
    const events: CustomEvent[] = [
      { customEventId: 'x', name: 'Lunch', startMs: t('2026-08-07T12:00:00'), endMs: null },
    ]
    const s = buildEffectiveSchedule(miniConcert, {}, events)
    const entry = s.byDay.get(1)!.find(e => e.kind === 'custom')!
    expect(entry.endMs - entry.startMs).toBe(30 * 60_000)
  })
})
