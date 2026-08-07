import { describe, expect, it } from 'vitest'
import { classifyPlannedConcert, deriveDayState } from '~/domain/dayState'
import { buildEffectiveSchedule } from '~/domain/schedule'
import { DEFAULT_WIDGET_ORDER, type PickMap, type PlanSettings } from '~/domain/types'
import { miniConcert, t } from '../fixtures/mini'

const schedule = buildEffectiveSchedule(miniConcert, {}, [])

function settings(days: number[]): PlanSettings {
  return {
    eventId: miniConcert.eventId,
    attendingDayIndexes: days,
    conflictDisplayPref: 'equal',
    backburnerNotifyDefault: false,
    timetableViewPref: 'compact',
    widgetOrder: [...DEFAULT_WIDGET_ORDER],
    leadTimeOverrideMin: null,
  }
}

function picksOf(entries: Array<[string, 'preferred' | 'backburner' | 'skipped']>): PickMap {
  return Object.fromEntries(entries.map(([id, status]) => [
    id,
    { performanceId: id, status, notifyOptIn: false },
  ]))
}

const bothDays = settings([1, 2])
const somePicks = picksOf([['a', 'preferred'], ['b', 'backburner'], ['d', 'skipped']])

function derive(nowIso: string, s = bothDays, picks = somePicks) {
  return deriveDayState({
    concert: miniConcert,
    settings: s,
    picks,
    schedule,
    nowMs: t(nowIso),
  })
}

describe('deriveDayState — mode', () => {
  it('pre before the first attending day', () => {
    const st = derive('2026-08-05T12:00:00')
    expect(st.mode).toBe('pre')
    expect(st.kickoffMs).toBe(t('2026-08-07T15:00:00')) // first perf of day 1 (d)
  })

  it('concert-day during an attending day', () => {
    const st = derive('2026-08-07T19:30:00')
    expect(st.mode).toBe('concert-day')
    expect(st.todayDayIndex).toBe(1)
    expect(st.nextAttendingDayIndex).toBe(2)
  })

  it('stays on day 1 during the past-midnight spill while its set runs', () => {
    const st = derive('2026-08-08T00:10:00') // late set runs till 00:15
    expect(st.todayDayIndex).toBe(1)
  })

  it('switches to day 2 once the spill set ends', () => {
    const st = derive('2026-08-08T00:20:00')
    expect(st.todayDayIndex).toBe(2)
  })

  it('post after the last attending window', () => {
    const st = derive('2026-08-09T12:00:00')
    expect(st.mode).toBe('post')
  })

  it('pre (not between-days) when the user\'s own first day has not started', () => {
    // Attends only day 2 while day 1 is running — their concert hasn't begun
    const day2Only = settings([2])
    const st = derive('2026-08-07T19:00:00', day2Only)
    expect(st.mode).toBe('pre')
    expect(st.kickoffMs).toBe(t('2026-08-08T20:00:00')) // first perf of day 2
  })
})

describe('deriveDayState — completion (F-2)', () => {
  it('dayComplete once every chosen entry has ended', () => {
    // chosen on day 1: a (ends 20:00). At 20:30 → complete; day 2 remains
    const st = derive('2026-08-07T20:30:00')
    expect(st.dayComplete).toBe(true)
    expect(st.concertComplete).toBe(false)
    expect(st.nextAttendingDayIndex).toBe(2)
  })

  it('not complete while a chosen entry still runs', () => {
    const st = derive('2026-08-07T19:30:00')
    expect(st.dayComplete).toBe(false)
  })

  it('concertComplete on the last attending day', () => {
    const picks = picksOf([['d2solo', 'preferred']])
    const st = derive('2026-08-08T21:30:00', bothDays, picks)
    expect(st.todayDayIndex).toBe(2)
    expect(st.dayComplete).toBe(true)
    expect(st.concertComplete).toBe(true)
  })
})

describe('deriveDayState — widget lists', () => {
  it('splits upcoming entries into upNext / backburner / other', () => {
    const st = derive('2026-08-07T18:00:00')
    expect(st.upNext.map(p => p.performanceId)).toEqual(['a'])
    expect(st.upcomingBackburner.map(p => p.performanceId)).toEqual(['b'])
    // c never picked; late never picked; d skipped but already past at 18:00
    expect(st.upcomingOther.map(p => p.performanceId).sort()).toEqual(['c', 'late'])
  })

  it('includes skipped upcoming sets in "other" (re-addable, W-4)', () => {
    const picks = picksOf([['c', 'skipped']])
    const st = derive('2026-08-07T18:00:00', bothDays, picks)
    expect(st.upcomingOther.map(p => p.performanceId)).toContain('c')
  })

  it('excludes started sets from upNext', () => {
    const st = derive('2026-08-07T19:01:00')
    expect(st.upNext.map(p => p.performanceId)).not.toContain('a')
  })
})

describe('classifyPlannedConcert (H-2)', () => {
  it('upcoming before and during the plan', () => {
    expect(classifyPlannedConcert(schedule, bothDays, t('2026-08-05T10:00:00'))).toBe('upcoming')
    expect(classifyPlannedConcert(schedule, bothDays, t('2026-08-07T20:00:00'))).toBe('upcoming')
  })

  it('past after the last attending window', () => {
    expect(classifyPlannedConcert(schedule, bothDays, t('2026-08-09T12:00:00'))).toBe('past')
  })

  it('day-1-only plans turn past while day 2 still runs', () => {
    const day1Only = settings([1])
    expect(classifyPlannedConcert(schedule, day1Only, t('2026-08-08T12:00:00'))).toBe('past')
  })
})
