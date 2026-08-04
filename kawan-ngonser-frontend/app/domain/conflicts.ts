/**
 * Conflict detection (§6). Definition: two performances conflict when their
 * time ranges overlap by ANY amount — even one minute. Touching boundaries
 * (A ends 20:00, B starts 20:00) do NOT conflict.
 */
import type { ConflictPrompt, PickMap } from './types'

export interface TimeRange {
  startMs: number
  endMs: number
}

export function overlaps(a: TimeRange, b: TimeRange): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs
}

export interface Timed extends TimeRange {
  performanceId: string
  dayIndex: number
}

/**
 * Connected components over the overlap relation (transitive: A↔B, B↔C group
 * together even when A and C don't overlap — matches O-2's "50/50, 33/33/33").
 * Only groups of ≥2 are returned, sorted by earliest start.
 */
export function findConflictGroups<T extends Timed>(perfs: T[]): T[][] {
  const sorted = [...perfs].sort((a, b) => a.startMs - b.startMs)
  const groups: T[][] = []
  let current: T[] = []
  let currentMaxEnd = -Infinity

  for (const p of sorted) {
    if (current.length > 0 && p.startMs < currentMaxEnd) {
      current.push(p)
    }
    else {
      if (current.length >= 2) groups.push(current)
      current = [p]
      currentMaxEnd = -Infinity
    }
    currentMaxEnd = Math.max(currentMaxEnd, p.endMs)
  }
  if (current.length >= 2) groups.push(current)
  return groups
}

/**
 * O-4 trigger: conflict groups that contain ≥2 PREFERRED picks. Each becomes
 * one "Schedule clash! Who gets you?" prompt (only the preferred members are
 * offered — backburners in the group already lost a duel).
 */
export function detectUnresolvedConflicts(picks: PickMap, schedule: Timed[]): ConflictPrompt[] {
  const preferred = schedule.filter(p => picks[p.performanceId]?.status === 'preferred')
  return findConflictGroups(preferred).map(group => ({
    dayIndex: group[0]!.dayIndex,
    performanceIds: group.map(p => p.performanceId),
  }))
}
