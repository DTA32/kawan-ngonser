import { describe, expect, it } from 'vitest'
import {
  classifyPlannedConcert,
  dayPhaseOf,
  deriveDayState,
  isPastDay,
  pastAttendingDays,
  upcomingAttendingDays,
  visibleWidgetsFor,
} from '~/domain/dayState'
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
    hiddenWidgets: [],
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

  it('keeps a running set listed until it ENDS, not when it starts', () => {
    // a: preferred, 19:00–20:00 — still catchable while it plays
    expect(derive('2026-08-07T19:30:00').upNext.map(p => p.performanceId)).toContain('a')
    expect(derive('2026-08-07T20:00:00').upNext.map(p => p.performanceId)).not.toContain('a')
  })

  it('applies the same end-based rule to backburner and other', () => {
    // b: backburner 19:59–21:00
    const mid = derive('2026-08-07T20:30:00')
    expect(mid.upcomingBackburner.map(p => p.performanceId)).toContain('b')

    // c: unpicked 21:00–22:00 — the W-4 case from the field report
    const inC = derive('2026-08-07T21:30:00')
    expect(inC.upcomingOther.map(p => p.performanceId)).toContain('c')
    expect(inC.upcomingBackburner.map(p => p.performanceId)).not.toContain('b')
  })
})

describe('deriveDayState — past performances (W-6)', () => {
  it('lists ended sets by END time, newest first', () => {
    // d 15:00–16:00, e 15:30–16:30, f 16:15–17:00 — d STARTS first but ends
    // first too, so this pins the sort to endMs rather than the entry order.
    expect(derive('2026-08-07T18:00:00').pastPerformances.map(p => p.performanceId))
      .toEqual(['f', 'e', 'd'])
  })

  it('moves a set to past the moment it ENDS — the mirror of the upcoming rule', () => {
    const mid = derive('2026-08-07T19:30:00')
    expect(mid.upNext.map(p => p.performanceId)).toContain('a')
    expect(mid.pastPerformances.map(p => p.performanceId)).not.toContain('a')

    const atEnd = derive('2026-08-07T20:00:00')
    expect(atEnd.upNext.map(p => p.performanceId)).not.toContain('a')
    expect(atEnd.pastPerformances[0]!.performanceId).toBe('a')
  })

  it('is empty before anything has finished', () => {
    expect(derive('2026-08-07T14:00:00').pastPerformances).toEqual([])
  })

  it('holds every set regardless of pick status', () => {
    // d was skipped, e/f never picked — a recap shows what played, not what
    // you chose (the timetable collapse already covers your picks).
    const ids = derive('2026-08-07T18:00:00').pastPerformances.map(p => p.performanceId)
    expect(ids).toContain('d')
    expect(ids).toContain('e')
  })

  it('partitions the day: past + upNext + backburner + other, each set once', () => {
    const st = derive('2026-08-07T21:30:00')
    const seen = [
      ...st.pastPerformances,
      ...st.upNext,
      ...st.upcomingBackburner,
      ...st.upcomingOther,
    ].map(p => p.performanceId)

    const dayOne = miniConcert.performances
      .filter(p => p.dayIndex === 1)
      .map(p => p.performanceId)

    expect(seen.sort()).toEqual([...dayOne].sort())
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('excludes custom events', () => {
    const withBreak = buildEffectiveSchedule(miniConcert, {}, [{
      customEventId: 'lunch',
      name: 'Lunch',
      startMs: t('2026-08-07T12:00:00'),
      endMs: t('2026-08-07T12:30:00'),
    }])
    const st = deriveDayState({
      concert: miniConcert,
      settings: bothDays,
      picks: somePicks,
      schedule: withBreak,
      nowMs: t('2026-08-07T18:00:00'),
    })
    expect(st.pastPerformances).toHaveLength(3)
    expect(st.pastPerformances.every(p => p.artistName !== undefined)).toBe(true)
  })

  it('is scoped to today, not the whole concert', () => {
    // Day 2 at 21:30: d2solo has ended, day 1's sets are not in this list.
    const st = derive('2026-08-08T21:30:00')
    expect(st.todayDayIndex).toBe(2)
    expect(st.pastPerformances.map(p => p.performanceId)).toEqual(['d2solo'])
  })

  it('is empty outside a concert day', () => {
    expect(derive('2026-08-09T12:00:00').pastPerformances).toEqual([])
  })
})

describe('isPastDay / dayPhaseOf', () => {
  const todayOn = (nowIso: string) => derive(nowIso).todayDayIndex
  const phase = (dayIndex: number, nowIso: string) => dayPhaseOf({
    schedule,
    dayIndex,
    todayDayIndex: todayOn(nowIso),
    nowMs: t(nowIso),
  })

  it('closes a day at the end of its window, spill included', () => {
    // day 1 spills to 00:15 on Aug 8 because `late` runs 23:15–00:15
    expect(isPastDay(schedule, 1, t('2026-08-08T00:14:00'))).toBe(false)
    expect(isPastDay(schedule, 1, t('2026-08-08T00:15:00'))).toBe(true)
  })

  it('keeps the spilling day as today while its last set runs', () => {
    // Both windows contain 00:10 — a window-only rule would say day 2 is today
    // and paint a now-line on a board the user hasn't reached.
    expect(phase(1, '2026-08-08T00:10:00')).toBe('today')
    expect(phase(2, '2026-08-08T00:10:00')).toBe('future')
  })

  it('reads past / today / future around the live day', () => {
    expect(phase(1, '2026-08-08T02:00:00')).toBe('past')
    expect(phase(2, '2026-08-08T02:00:00')).toBe('today')
    expect(phase(2, '2026-08-06T12:00:00')).toBe('future')
    expect(phase(2, '2026-08-09T12:00:00')).toBe('past')
  })

  it('treats an unknown day as future, never read-only', () => {
    expect(phase(3, '2026-08-09T12:00:00')).toBe('future')
  })
})

describe('upcomingAttendingDays / pastAttendingDays', () => {
  const args = (dayIndex: number, nowIso: string) => ({
    schedule,
    attending: [1, 2],
    dayIndex,
    nowMs: t(nowIso),
  })

  it('lists days ahead that have not ended', () => {
    expect(upcomingAttendingDays(args(1, '2026-08-06T12:00:00'))).toEqual([2])
    // W-5 must not point backwards once day 2 is over
    expect(upcomingAttendingDays(args(1, '2026-08-09T12:00:00'))).toEqual([])
  })

  it('lists earlier days that have ended, nearest first', () => {
    expect(pastAttendingDays(args(2, '2026-08-08T21:00:00'))).toEqual([1])
    // day 1 is still running (its spill window is open) — nothing behind you
    expect(pastAttendingDays(args(2, '2026-08-08T00:10:00'))).toEqual([])
    expect(pastAttendingDays(args(1, '2026-08-09T12:00:00'))).toEqual([])
  })
})

describe('visibleWidgetsFor', () => {
  it('leaves today untouched', () => {
    expect(visibleWidgetsFor(DEFAULT_WIDGET_ORDER, [], 'today')).toEqual(DEFAULT_WIDGET_ORDER)
  })

  it('drops the forward-looking widgets on a day that is over', () => {
    const visible = visibleWidgetsFor(DEFAULT_WIDGET_ORDER, [], 'past')
    expect(visible).toEqual(['timetable', 'pastPerformances', 'nextDays', 'pastDays'])
  })

  it('drops the recap on a day that is still ahead', () => {
    expect(visibleWidgetsFor(DEFAULT_WIDGET_ORDER, [], 'future'))
      .not.toContain('pastPerformances')
  })

  it('drops user-hidden widgets in every phase, preserving order', () => {
    expect(visibleWidgetsFor(DEFAULT_WIDGET_ORDER, ['timetable', 'pastDays'], 'today'))
      .toEqual(['upNext', 'backburner', 'other', 'pastPerformances', 'nextDays'])
    expect(visibleWidgetsFor(DEFAULT_WIDGET_ORDER, ['pastPerformances'], 'past'))
      .toEqual(['timetable', 'nextDays', 'pastDays'])
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
