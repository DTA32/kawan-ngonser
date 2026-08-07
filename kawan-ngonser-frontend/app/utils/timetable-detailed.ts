/**
 * W-2 timetable — DETAILED model. The compact sibling (utils/timetable) packs
 * overlaps into uniform cluster rows; this one is minute-proportional: an hour
 * axis, block heights that mean something, and lane packing so a partial clash
 * looks partial. Both views read the same entries through `toColumns`.
 *
 * Everything here is pure geometry in px — the component only positions what
 * it is handed, so the fiddly parts stay unit-testable without a DOM.
 */
import { overlaps } from '~/domain/conflicts'
import type { ConflictDisplayPref, PickMap, ScheduleEntry } from '~/domain/types'
import { type TimetableColumn, type TimetableRole, toColumns } from './timetable'

/** Vertical scale. 64px/hour shows ~6 hours in the widget's canvas. */
export const HOUR_PX = 64
const PX_PER_MIN = HOUR_PX / 60
const HOUR_MS = 60 * 60 * 1000
/** Floor for very short custom events, so they stay tappable. */
const MIN_BLOCK_PX = 22
/** Hour labels this close to the now-chip are suppressed — the chip wins. */
const LABEL_SUPPRESS_MS = 10 * 60 * 1000

/** How much text fits at the block's computed height. */
export type BlockDensity = 'full' | 'medium' | 'tight'
const DENSITY_FULL_PX = 56
const DENSITY_MEDIUM_PX = 40

export interface DetailedBlock {
  entry: ScheduleEntry
  role: TimetableRole
  /** px from the canvas top */
  top: number
  height: number
  /** Fractions of the content width (0..1) — resolution-independent */
  left: number
  width: number
  past: boolean
  density: BlockDensity
}

export interface HourLine {
  labelMs: number
  top: number
  /** The now-chip sits on this label — don't draw it twice */
  suppressed: boolean
}

export interface DetailedModel {
  /** Canvas bounds, snapped out to whole hours */
  startMs: number
  endMs: number
  height: number
  hours: HourLine[]
  blocks: DetailedBlock[]
  /** px offset of the now-line, or null when now is outside the canvas */
  nowTop: number | null
}

function densityOf(height: number): BlockDensity {
  if (height >= DENSITY_FULL_PX) return 'full'
  if (height >= DENSITY_MEDIUM_PX) return 'medium'
  return 'tight'
}

/**
 * Transitive overlap clusters (A↔B, B↔C group together even when A and C
 * don't touch) — same relation as domain/conflicts, over columns so custom
 * events cluster with performances.
 */
function cluster(columns: TimetableColumn[]): TimetableColumn[][] {
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
  return clusters
}

/**
 * Greedy lane packing (the Apple-Calendar part): each entry takes the first
 * lane whose last occupant has already ended, then widens across adjacent
 * lanes that hold nothing overlapping it.
 *
 * This is what the compact view can't express — three entries in one cluster
 * need only two lanes when the third starts after the first ends, instead of
 * being squeezed into a flat 33/33/33.
 */
function packLanes(group: TimetableColumn[]): { col: TimetableColumn, lane: number, span: number, lanes: number }[] {
  const lanes: TimetableColumn[][] = []
  const placed: { col: TimetableColumn, lane: number }[] = []

  for (const col of group) {
    let lane = lanes.findIndex(l => l[l.length - 1]!.entry.endMs <= col.entry.startMs)
    if (lane === -1) {
      lane = lanes.length
      lanes.push([])
    }
    lanes[lane]!.push(col)
    placed.push({ col, lane })
  }

  return placed.map(({ col, lane }) => {
    let span = 1
    while (lane + span < lanes.length
      && !lanes[lane + span]!.some(other => overlaps(col.entry, other.entry))) {
      span++
    }
    return { col, lane, span, lanes: lanes.length }
  })
}

export function buildDetailedModel(input: {
  entries: ScheduleEntry[]
  picks: PickMap
  pref: ConflictDisplayPref
  nowMs: number
  mode: 'today' | 'preview'
  /** dayWindows fallback for a day with nothing planned yet */
  dayWindow?: [number, number]
}): DetailedModel {
  const { picks, pref, nowMs, mode } = input
  const columns = toColumns(input.entries, picks, pref)

  // 1. Canvas window — whole hours around the content, including now today
  const bounds: number[] = []
  for (const col of columns) bounds.push(col.entry.startMs, col.entry.endMs)
  if (mode === 'today') bounds.push(nowMs)
  if (bounds.length === 0 && input.dayWindow) bounds.push(...input.dayWindow)

  const startMs = bounds.length > 0
    ? Math.floor(Math.min(...bounds) / HOUR_MS) * HOUR_MS
    : 0
  const endMs = bounds.length > 0
    ? Math.ceil(Math.max(...bounds) / HOUR_MS) * HOUR_MS
    : 0
  const height = ((endMs - startMs) / 60_000) * PX_PER_MIN
  const topOf = (ms: number) => ((ms - startMs) / 60_000) * PX_PER_MIN

  // 2. Hour rules
  const hours: HourLine[] = []
  for (let ms = startMs; ms <= endMs; ms += HOUR_MS) {
    hours.push({
      labelMs: ms,
      top: topOf(ms),
      suppressed: mode === 'today' && Math.abs(ms - nowMs) < LABEL_SUPPRESS_MS,
    })
  }

  // 3. Geometry + lanes, per cluster
  const blocks: DetailedBlock[] = []
  for (const group of cluster(columns)) {
    for (const { col, lane, span, lanes } of packLanes(group)) {
      const blockHeight = Math.max(
        MIN_BLOCK_PX,
        ((col.entry.endMs - col.entry.startMs) / 60_000) * PX_PER_MIN,
      )
      blocks.push({
        entry: col.entry,
        role: col.role,
        top: topOf(col.entry.startMs),
        height: blockHeight,
        left: lane / lanes,
        width: span / lanes,
        past: mode === 'today' && col.entry.endMs <= nowMs,
        density: densityOf(blockHeight),
      })
    }
  }

  const nowTop = mode === 'today' && nowMs >= startMs && nowMs <= endMs
    ? topOf(nowMs)
    : null

  return { startMs, endMs, height, hours, blocks, nowTop }
}

/** Canvas y → the time it represents, rounded to 5 min (tap-to-add). */
export function timeAtOffset(model: DetailedModel, offsetPx: number): number {
  const ms = model.startMs + (offsetPx / PX_PER_MIN) * 60_000
  const step = 5 * 60_000
  return Math.round(ms / step) * step
}
