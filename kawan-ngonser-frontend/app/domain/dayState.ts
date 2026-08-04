/**
 * Everything the home screen derives from "now": which mode the app is in,
 * whether today is done (F-2), what's coming up (W-1/W-3/W-4), and the O-5
 * countdown target. Pure — `nowMs` is always a parameter.
 */
import type {
  Concert,
  EffectivePerformance,
  EffectiveSchedule,
  PickMap,
  PlanSettings,
  ScheduleEntry,
} from './types'

export type HomeMode = 'pre' | 'concert-day' | 'between-days' | 'post'

export interface DayState {
  mode: HomeMode
  /** Set when mode === 'concert-day' */
  todayDayIndex: number | null
  /** Next attending day after today (W-5 / C13 "Peek at Day {x}") */
  nextAttendingDayIndex: number | null
  /** F-2: today's chosen entries are all done */
  dayComplete: boolean
  /** F-2: last (or only) attending day complete */
  concertComplete: boolean
  /** W-1: next preferred performances (soonest first) */
  upNext: EffectivePerformance[]
  /** W-3: upcoming backburner performances */
  upcomingBackburner: EffectivePerformance[]
  /** W-4: upcoming performances with no active pick (incl. skipped — re-addable) */
  upcomingOther: EffectivePerformance[]
  /** O-5 countdown target (first performance of the first attending day) */
  kickoffMs: number | null
}

interface DayStateInput {
  concert: Concert
  settings: PlanSettings
  picks: PickMap
  schedule: EffectiveSchedule
  nowMs: number
}

function entriesOf(schedule: EffectiveSchedule, dayIndex: number): ScheduleEntry[] {
  return schedule.byDay.get(dayIndex) ?? []
}

/** "Chosen" entries for day-completion: preferred picks + custom events. */
function chosenEntries(input: DayStateInput, dayIndex: number): ScheduleEntry[] {
  return entriesOf(input.schedule, dayIndex).filter(e =>
    e.kind === 'custom'
    || input.picks[e.performance.performanceId]?.status === 'preferred')
}

export function deriveDayState(input: DayStateInput): DayState {
  const { concert, settings, picks, schedule, nowMs } = input
  const attending = settings.attendingDayIndexes
    .filter(d => schedule.dayWindows.has(d))
    .sort((a, b) => a - b)

  // Candidates: attending days whose window (midnight → spill end) contains now
  const containing = attending.filter((d) => {
    const [start, end] = schedule.dayWindows.get(d)!
    return nowMs >= start && nowMs < end
  })

  // Overlap (a spilling day 1 at 00:10 of day 2): stay on the earlier day
  // while its entries still run, else switch to the later one.
  let todayDayIndex: number | null = null
  if (containing.length === 1) {
    todayDayIndex = containing[0]!
  }
  else if (containing.length > 1) {
    const earlier = containing[0]!
    const stillRunning = entriesOf(schedule, earlier).some(e => e.endMs > nowMs)
    todayDayIndex = stillRunning ? earlier : containing[containing.length - 1]!
  }

  const firstDay = attending[0] ?? null
  const lastDay = attending[attending.length - 1] ?? null

  let mode: HomeMode
  if (attending.length === 0) {
    mode = 'pre'
  }
  else if (todayDayIndex !== null) {
    mode = 'concert-day'
  }
  else if (firstDay !== null && nowMs < schedule.dayWindows.get(firstDay)![0]) {
    mode = 'pre'
  }
  else if (lastDay !== null && nowMs >= schedule.dayWindows.get(lastDay)![1]) {
    mode = 'post'
  }
  else {
    mode = 'between-days'
  }

  const nextAttendingDayIndex = todayDayIndex !== null
    ? attending.find(d => d > todayDayIndex!) ?? null
    : mode === 'between-days'
      ? attending.find(d => nowMs < schedule.dayWindows.get(d)![0]) ?? null
      : null

  let dayComplete = false
  let concertComplete = false
  const upNext: EffectivePerformance[] = []
  const upcomingBackburner: EffectivePerformance[] = []
  const upcomingOther: EffectivePerformance[] = []

  if (todayDayIndex !== null) {
    const chosen = chosenEntries(input, todayDayIndex)
    const yardstick = chosen.length > 0 ? chosen : entriesOf(schedule, todayDayIndex)
    dayComplete = yardstick.length > 0 && yardstick.every(e => e.endMs <= nowMs)
    concertComplete = dayComplete && todayDayIndex === lastDay

    for (const e of entriesOf(schedule, todayDayIndex)) {
      if (e.kind !== 'performance' || e.startMs <= nowMs) continue
      const status = picks[e.performance.performanceId]?.status
      if (status === 'preferred') upNext.push(e.performance)
      else if (status === 'backburner') upcomingBackburner.push(e.performance)
      else upcomingOther.push(e.performance) // no pick or skipped — re-addable (W-4)
    }
  }

  const kickoffMs = firstDay !== null
    ? entriesOf(schedule, firstDay).find(e => e.kind === 'performance')?.startMs ?? null
    : null

  return {
    mode,
    todayDayIndex,
    nextAttendingDayIndex,
    dayComplete,
    concertComplete,
    upNext,
    upcomingBackburner,
    upcomingOther,
    kickoffMs,
  }
}

/** H-2 grouping: a planned concert is 'past' once its last attending window ends. */
export function classifyPlannedConcert(
  schedule: EffectiveSchedule,
  settings: PlanSettings,
  nowMs: number,
): 'upcoming' | 'past' {
  const attending = settings.attendingDayIndexes.filter(d => schedule.dayWindows.has(d))
  if (attending.length === 0) return 'upcoming'
  const lastEnd = Math.max(...attending.map(d => schedule.dayWindows.get(d)![1]))
  return nowMs >= lastEnd ? 'past' : 'upcoming'
}
