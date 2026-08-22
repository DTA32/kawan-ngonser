/**
 * F-1 revalidation: the concert data (including local edits) is replaced;
 * the user's PLAN survives and is re-validated against the new payload.
 * Pure — the service layer owns fetching + the atomic Dexie commit.
 *
 * Documented interpretations (flagged in the plan's risk register):
 *  - a backburner whose conflict dissolved is auto-promoted (the user picked
 *    that artist; the only reason it was demoted no longer exists);
 *  - attending days that vanished are clamped out;
 *  - skipped picks stay skipped while their performance survives.
 */
import { detectUnresolvedConflicts } from './conflicts'
import { applyOverrides } from './overrides'
import { promoteFreedBackburners } from './picks'
import type { Concert, ConflictPrompt, PickMap } from './types'

export interface SyncReport {
  droppedPerformanceIds: string[]
  promotedPerformanceIds: string[]
  removedDayIndexes: number[]
  conflictsToResolve: number
}

export interface RevalidationResult {
  attendingDayIndexes: number[]
  picks: PickMap
  pendingConflicts: ConflictPrompt[]
  report: SyncReport
}

export function revalidatePlan(input: {
  newConcert: Concert
  attendingDayIndexes: number[]
  picks: PickMap
}): RevalidationResult {
  const { newConcert } = input
  // Post-sync there are no overrides by definition
  const schedule = applyOverrides(newConcert.performances, {})
  const validIds = new Set(schedule.map(p => p.performanceId))

  // 1. Drop picks whose performance no longer exists
  const droppedPerformanceIds: string[] = []
  let picks: PickMap = {}
  for (const pick of Object.values(input.picks)) {
    if (validIds.has(pick.performanceId)) picks[pick.performanceId] = pick
    else droppedPerformanceIds.push(pick.performanceId)
  }

  // 2. Clamp attending days to days that still exist
  const validDays = new Set(newConcert.days.map(d => d.dayIndex))
  const attendingDayIndexes = input.attendingDayIndexes.filter(d => validDays.has(d))
  const removedDayIndexes = input.attendingDayIndexes.filter(d => !validDays.has(d))

  // 3. Promote backburners whose conflict dissolved under the new times
  const promo = promoteFreedBackburners(picks, schedule)
  picks = promo.picks
  const promotedPerformanceIds = promo.effects
    .filter(e => e.type === 'promoted')
    .map(e => (e as { performanceId: string }).performanceId)
  const promoPrompts = promo.effects
    .filter(e => e.type === 'conflict')
    .map(e => (e as { prompt: ConflictPrompt }).prompt)

  // 4. New preferred-vs-preferred overlaps (changed times) → O-4 again
  const prefPrompts = detectUnresolvedConflicts(picks, schedule)

  const pendingConflicts = [...prefPrompts, ...promoPrompts]

  return {
    attendingDayIndexes,
    picks,
    pendingConflicts,
    report: {
      droppedPerformanceIds,
      promotedPerformanceIds,
      removedDayIndexes,
      conflictsToResolve: pendingConflicts.length,
    },
  }
}

// ---------------------------------------------------------------------------
// B-14 — re-import of an uploaded concert
// ---------------------------------------------------------------------------

/**
 * What an H-3 upload should DO, decided before anything is written.
 *
 * Before the Concert Builder, every upload simply overwrote the cache row, so
 * re-uploading a newer file for a concert you had already planned replaced the
 * data without ever re-validating the plan against it — picks could end up
 * pointing at performances that no longer existed. Sharing exported builds
 * makes that the normal case rather than an edge case (§13), so the version is
 * now the deciding input:
 *
 *  - not planned yet     → plain save, nothing to protect
 *  - newer than ours     → run the F-1 revalidation path (C12 first when the
 *                          user has local performance edits to lose)
 *  - same or older       → decline; the user's copy is at least as fresh
 */
export type UploadDecision
  = | { kind: 'fresh' }
    | { kind: 'reimport', needsEditConfirm: boolean }
    | { kind: 'stale', incoming: number, current: number }

export function classifyUpload(input: {
  planned: boolean
  incomingVersion: number
  currentVersion: number | null
  hasLocalEdits: boolean
}): UploadDecision {
  if (!input.planned || input.currentVersion === null) return { kind: 'fresh' }
  if (input.incomingVersion <= input.currentVersion) {
    return { kind: 'stale', incoming: input.incomingVersion, current: input.currentVersion }
  }
  return { kind: 'reimport', needsEditConfirm: input.hasLocalEdits }
}
