/**
 * W-2 timetable model — the fiddliest UI logic, kept pure and unit-tested.
 * Cluster-row rendering (not minute-proportional): overlapping entries form
 * one slot whose columns split equally (O-2a) or hide the backburner (O-2b).
 *
 * The timetable shows ONLY planned content: preferred picks, backburner picks
 * (per display pref), and custom events. Unpicked/skipped sets live in W-4.
 */
import type { DayPhase } from '~/domain/dayState'
import type { ConflictDisplayPref, PickMap, ScheduleEntry } from '~/domain/types'

export type TimetableRole = 'preferred' | 'backburner' | 'custom'

export interface TimetableColumn {
  entry: ScheduleEntry
  role: TimetableRole
}

export interface SlotNode {
  type: 'slot'
  /** Earliest start in the cluster — the hour-column label */
  labelMs: number
  /** Latest end in the cluster — the past threshold and the now-line denominator */
  maxEndMs: number
  /**
   * The cluster has ENDED. Distinct from the `past` bucket below: that means
   * "collapsed behind Earlier today" and only ever fills on today's board,
   * whereas this is true in any phase and drives the dimmed entry styling.
   */
  past: boolean
  /** Columns chunked into rows of ≤3 (50/50, 33/33/33 per O-2a) */
  rows: TimetableColumn[][]
}

export interface GapNode {
  type: 'gap'
  /** Suggested start for the custom-event sheet (rounded to 5 min) */
  prefillMs: number
}

export type TimetableNode = SlotNode | GapNode

/**
 * Where the compact now-line goes. The compact view is a card list with no
 * time→pixel axis, so the line can't float freely: it rides INSIDE the cluster
 * that is currently playing, at the elapsed fraction of that cluster's span.
 * `null` means nothing is playing — the line falls back to a plain divider
 * between the ended and not-yet-started entries.
 */
export interface NowMarker {
  /** Index into `visible` (always rendered before `later`, so it stays valid) */
  nodeIndex: number
  /** 0..1 down the slot row */
  fraction: number
  /** The line would collide with the row's own gutter time label */
  suppressLabel: boolean
}

export interface TimetableModel {
  /** Fully-ended clusters, collapsed behind "Earlier today" (today only) */
  past: SlotNode[]
  /** Performances (not custom events) inside `past` — "{n} sets played" */
  pastSetCount: number
  /** Now → forward window */
  visible: TimetableNode[]
  /** Behind "Show until end of day" */
  later: TimetableNode[]
  /** Today only, and only while a cluster is actually running */
  nowMarker: NowMarker | null
}

const DEFAULT_WINDOW_MS = 3 * 60 * 60 * 1000
const GAP_MIN_MS = 25 * 60 * 1000
const MAX_COLUMNS = 3
/**
 * Below this fraction the marker's own time label overlaps the slot's gutter
 * label. The detailed view has the same problem and solves it the same way
 * (LABEL_SUPPRESS_MS in utils/timetable-detailed).
 */
const LABEL_SUPPRESS_FRACTION = 0.18
const ROLE_ORDER: Record<TimetableRole, number> = { preferred: 0, custom: 1, backburner: 2 }

/**
 * Role assignment + filtering, shared by BOTH timetable views (compact here,
 * proportional in utils/timetable-detailed) so the two can never disagree on
 * what belongs on the timetable. Sorted by start.
 */
export function toColumns(
  entries: ScheduleEntry[],
  picks: PickMap,
  pref: ConflictDisplayPref,
): TimetableColumn[] {
  const columns: TimetableColumn[] = []
  for (const entry of entries) {
    if (entry.kind === 'custom') {
      columns.push({ entry, role: 'custom' })
      continue
    }
    const status = picks[entry.performance.performanceId]?.status
    if (status === 'preferred') columns.push({ entry, role: 'preferred' })
    else if (status === 'backburner' && pref === 'equal') columns.push({ entry, role: 'backburner' })
  }
  columns.sort((a, b) => a.entry.startMs - b.entry.startMs)
  return columns
}

export function buildTimetableModel(input: {
  entries: ScheduleEntry[]
  picks: PickMap
  pref: ConflictDisplayPref
  nowMs: number
  phase: DayPhase
  forwardWindowMs?: number
}): TimetableModel {
  const { picks, pref, nowMs, phase } = input
  const windowMs = input.forwardWindowMs ?? DEFAULT_WINDOW_MS

  // 1. Roles + filtering
  const columns = toColumns(input.entries, picks, pref)

  // 2. Transitive overlap clustering
  const clusters: TimetableColumn[][] = []
  let current: TimetableColumn[] = []
  let maxEnd = -Infinity
  for (const col of columns) {
    if (current.length > 0 && col.entry.startMs < maxEnd) {
      current.push(col)
      maxEnd = Math.max(maxEnd, col.entry.endMs)
    }
    else {
      if (current.length > 0) clusters.push(current)
      current = [col]
      maxEnd = col.entry.endMs
    }
  }
  if (current.length > 0) clusters.push(current)

  // 3. Slots: order columns, chunk into rows of ≤3
  function toSlot(cluster: TimetableColumn[]): SlotNode {
    const ordered = [...cluster].sort((a, b) =>
      ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.entry.startMs - b.entry.startMs)
    const rows: TimetableColumn[][] = []
    for (let i = 0; i < ordered.length; i += MAX_COLUMNS)
      rows.push(ordered.slice(i, i + MAX_COLUMNS))
    const maxEndMs = Math.max(...cluster.map(c => c.entry.endMs))
    return {
      type: 'slot',
      labelMs: Math.min(...cluster.map(c => c.entry.startMs)),
      rows,
      maxEndMs,
      past: maxEndMs <= nowMs,
    }
  }
  const slots = clusters.map(toSlot)

  // 4. Partition + gaps
  const past: SlotNode[] = []
  const upcoming: SlotNode[] = []
  for (const slot of slots) {
    // Only today collapses its ended clusters — a finished day shows in full,
    // and a day still ahead has nothing to collapse.
    if (phase === 'today' && slot.past) past.push(slot)
    else upcoming.push(slot)
  }

  const visible: TimetableNode[] = []
  const later: TimetableNode[] = []
  const horizonMs = nowMs + windowMs
  let nowMarker: NowMarker | null = null
  for (let i = 0; i < upcoming.length; i++) {
    const slot = upcoming[i]!
    // Only today has a forward window; any other day renders whole.
    const bucket = phase !== 'today' || slot.labelMs <= horizonMs ? visible : later
    // gap before this slot (from the previous upcoming cluster)
    const prev = upcoming[i - 1]
    if (prev && slot.labelMs - prev.maxEndMs >= GAP_MIN_MS) {
      const rounded = Math.ceil(prev.maxEndMs / (5 * 60_000)) * 5 * 60_000
      bucket.push({ type: 'gap', prefillMs: rounded })
    }
    bucket.push(slot)

    // Clusters are disjoint and sorted, so at most one can contain `now`; and a
    // running one is always in `visible` (it started, so labelMs <= horizonMs).
    if (phase === 'today' && bucket === visible
      && slot.labelMs <= nowMs && nowMs < slot.maxEndMs) {
      const span = Math.max(1, slot.maxEndMs - slot.labelMs)
      const fraction = Math.min(1, Math.max(0, (nowMs - slot.labelMs) / span))
      nowMarker = {
        nodeIndex: visible.length - 1,
        fraction,
        suppressLabel: fraction < LABEL_SUPPRESS_FRACTION,
      }
    }
  }

  const pastSetCount = past.reduce(
    (n, slot) => n + slot.rows.flat().filter(c => c.role !== 'custom').length,
    0,
  )

  return { past, pastSetCount, visible, later, nowMarker }
}

/**
 * Start time to prefill the custom-event sheet with, for the day BEING SHOWN.
 *
 * The "add a break" buttons used to emit the wall clock, but CustomEventSheet
 * stamps the venue DATE of whatever it is given — so adding a break while
 * looking at another day silently filed it on today, where it vanished from the
 * board it was created on. Anchor to the shown day instead. Rounded to 5 min,
 * matching the gap-slot prefill above.
 */
export function customEventPrefillMs(input: {
  phase: DayPhase
  nowMs: number
  dayWindow: [number, number] | undefined
  /** Earliest planned start on that day, when there is one */
  firstEntryMs?: number
  offsetMs?: number
}): number {
  const { phase, nowMs, dayWindow, firstEntryMs, offsetMs = 0 } = input
  const round5 = (ms: number) => Math.round(ms / (5 * 60_000)) * 5 * 60_000

  // "15 minutes from now" only means something on the day that is actually now.
  if (phase === 'today' || !dayWindow) return round5(nowMs + offsetMs)

  const [start, end] = dayWindow
  const anchor = firstEntryMs ?? start
  return round5(Math.min(Math.max(anchor, start), end - 5 * 60_000))
}
