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
  WidgetId,
} from './types'

export type HomeMode = 'pre' | 'concert-day' | 'between-days' | 'post'

/**
 * Which side of "now" the day BEING SHOWN sits on. The board used to carry a
 * two-valued `mode: 'today' | 'preview'`, which forced "not today" and "in the
 * future" to be the same thing — so a finished day rendered as if it were still
 * ahead of you.
 */
export type DayPhase = 'past' | 'today' | 'future'

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
  /** W-1: in-progress + upcoming preferred performances (soonest first) */
  upNext: EffectivePerformance[]
  /** W-3: in-progress + upcoming backburner performances */
  upcomingBackburner: EffectivePerformance[]
  /** W-4: in-progress + upcoming with no active pick (incl. skipped — re-addable) */
  upcomingOther: EffectivePerformance[]
  /** W-6: today's performances that have ENDED, just-ended first */
  pastPerformances: EffectivePerformance[]
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
  const pastPerformances: EffectivePerformance[] = []

  if (todayDayIndex !== null) {
    const chosen = chosenEntries(input, todayDayIndex)
    const yardstick = chosen.length > 0 ? chosen : entriesOf(schedule, todayDayIndex)
    dayComplete = yardstick.length > 0 && yardstick.every(e => e.endMs <= nowMs)
    concertComplete = dayComplete && todayDayIndex === lastDay

    // Drop on END, not start: a set already playing is still catchable (and
    // still re-addable from W-4), so it stays listed until it actually ends.
    // Matches the timetable's past threshold (utils/timetable) and dayComplete.
    for (const e of entriesOf(schedule, todayDayIndex)) {
      if (e.kind !== 'performance') continue
      if (e.endMs <= nowMs) {
        pastPerformances.push(e.performance) // W-6: what already played
        continue
      }
      const status = picks[e.performance.performanceId]?.status
      if (status === 'preferred') upNext.push(e.performance)
      else if (status === 'backburner') upcomingBackburner.push(e.performance)
      else upcomingOther.push(e.performance) // no pick or skipped — re-addable (W-4)
    }
    // Entries arrive sorted by START, so a bare reverse would mis-order sets
    // that overlap. Just-ended first is what the recap wants.
    pastPerformances.sort((a, b) => b.endMs - a.endMs || b.startMs - a.startMs)
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
    pastPerformances,
    kickoffMs,
  }
}

/** H-5: a day is over once its window (midnight → spill end) has closed. */
export function isPastDay(
  schedule: EffectiveSchedule,
  dayIndex: number,
  nowMs: number,
): boolean {
  const window = schedule.dayWindows.get(dayIndex)
  return window !== undefined && nowMs >= window[1]
}

/**
 * Phase of the day being shown.
 *
 * `todayDayIndex` is a parameter rather than re-derived from `dayWindows`
 * because windows OVERLAP: at 00:10 on day 2, day 1's window is still open if
 * one of its sets spills past midnight. `deriveDayState` already owns that
 * tiebreak (stay on the earlier day while its entries run); duplicating a
 * window-only rule here would put a now-line on a board you haven't reached.
 */
export function dayPhaseOf(input: {
  schedule: EffectiveSchedule
  dayIndex: number
  todayDayIndex: number | null
  nowMs: number
}): DayPhase {
  const { schedule, dayIndex, todayDayIndex, nowMs } = input
  if (dayIndex === todayDayIndex) return 'today'
  return isPastDay(schedule, dayIndex, nowMs) ? 'past' : 'future'
}

/** W-5 "Your next days": attending days after `dayIndex` that have NOT ended. */
export function upcomingAttendingDays(input: {
  schedule: EffectiveSchedule
  attending: number[]
  dayIndex: number
  nowMs: number
}): number[] {
  const { schedule, attending, dayIndex, nowMs } = input
  return attending
    .filter(d => d > dayIndex && !isPastDay(schedule, d, nowMs))
    .sort((a, b) => a - b)
}

/** W-7 "Past days": attending days before `dayIndex` that have ended, nearest first. */
export function pastAttendingDays(input: {
  schedule: EffectiveSchedule
  attending: number[]
  dayIndex: number
  nowMs: number
}): number[] {
  const { schedule, attending, dayIndex, nowMs } = input
  return attending
    .filter(d => d < dayIndex && isPastDay(schedule, d, nowMs))
    .sort((a, b) => b - a)
}

/**
 * S-1 order filtered down to what still means something on the board being
 * shown: the user's hidden widgets always drop out; a finished day drops the
 * three forward-looking lists (their empty copy is present-tense — "No more
 * sets today." on a day two weeks gone is worse than an absent card); a day
 * still ahead drops the recap, since nothing on it can have ended.
 */
export function visibleWidgetsFor(
  order: WidgetId[],
  hidden: WidgetId[],
  phase: DayPhase,
): WidgetId[] {
  const off = new Set(hidden)
  return order.filter((id) => {
    if (off.has(id)) return false
    if (phase === 'past') return id !== 'upNext' && id !== 'backburner' && id !== 'other'
    if (phase === 'future') return id !== 'pastPerformances'
    return true
  })
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
