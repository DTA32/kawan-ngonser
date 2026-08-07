/**
 * W-2 timetable model — the fiddliest UI logic, kept pure and unit-tested.
 * Cluster-row rendering (not minute-proportional): overlapping entries form
 * one slot whose columns split equally (O-2a) or hide the backburner (O-2b).
 *
 * The timetable shows ONLY planned content: preferred picks, backburner picks
 * (per display pref), and custom events. Unpicked/skipped sets live in W-4.
 */
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
  /** Columns chunked into rows of ≤3 (50/50, 33/33/33 per O-2a) */
  rows: TimetableColumn[][]
}

export interface GapNode {
  type: 'gap'
  /** Suggested start for the custom-event sheet (rounded to 5 min) */
  prefillMs: number
}

export type TimetableNode = SlotNode | GapNode

export interface TimetableModel {
  /** Fully-ended clusters, collapsed behind "Earlier today" (today mode) */
  past: SlotNode[]
  /** Performances (not custom events) inside `past` — "{n} sets played" */
  pastSetCount: number
  /** Now → forward window */
  visible: TimetableNode[]
  /** Behind "Show until end of day" */
  later: TimetableNode[]
}

const DEFAULT_WINDOW_MS = 3 * 60 * 60 * 1000
const GAP_MIN_MS = 25 * 60 * 1000
const MAX_COLUMNS = 3
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
  mode: 'today' | 'preview'
  forwardWindowMs?: number
}): TimetableModel {
  const { picks, pref, nowMs, mode } = input
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
  function toSlot(cluster: TimetableColumn[]): SlotNode & { maxEndMs: number } {
    const ordered = [...cluster].sort((a, b) =>
      ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.entry.startMs - b.entry.startMs)
    const rows: TimetableColumn[][] = []
    for (let i = 0; i < ordered.length; i += MAX_COLUMNS)
      rows.push(ordered.slice(i, i + MAX_COLUMNS))
    return {
      type: 'slot',
      labelMs: Math.min(...cluster.map(c => c.entry.startMs)),
      rows,
      maxEndMs: Math.max(...cluster.map(c => c.entry.endMs)),
    }
  }
  const slots = clusters.map(toSlot)

  // 4. Partition + gaps
  const past: SlotNode[] = []
  const upcoming: (SlotNode & { maxEndMs: number })[] = []
  for (const slot of slots) {
    if (mode === 'today' && slot.maxEndMs <= nowMs) past.push(slot)
    else upcoming.push(slot)
  }

  const visible: TimetableNode[] = []
  const later: TimetableNode[] = []
  const horizonMs = nowMs + windowMs
  for (let i = 0; i < upcoming.length; i++) {
    const slot = upcoming[i]!
    const bucket = mode === 'preview' || slot.labelMs <= horizonMs ? visible : later
    // gap before this slot (from the previous upcoming cluster)
    const prev = upcoming[i - 1]
    if (prev && slot.labelMs - prev.maxEndMs >= GAP_MIN_MS) {
      const rounded = Math.ceil(prev.maxEndMs / (5 * 60_000)) * 5 * 60_000
      bucket.push({ type: 'gap', prefillMs: rounded })
    }
    bucket.push({ type: 'slot', labelMs: slot.labelMs, rows: slot.rows })
  }

  const pastSetCount = past.reduce(
    (n, slot) => n + slot.rows.flat().filter(c => c.role !== 'custom').length,
    0,
  )

  return { past, pastSetCount, visible, later }
}
