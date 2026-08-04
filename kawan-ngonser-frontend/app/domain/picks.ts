/**
 * The pick state machine: preferred | backburner | skipped (an unselected
 * performance has no pick row at all). Pure transitions — every function
 * returns a NEW pick map plus effects the UI turns into C29 toasts and O-4
 * conflict prompts. Overlap checks run against the effective (override-
 * applied) schedule so edited times behave correctly.
 */
import { detectUnresolvedConflicts, findConflictGroups, overlaps } from './conflicts'
import type { ConflictPrompt, EffectivePerformance, Pick, PickMap } from './types'

export type PickEffect
  = | { type: 'promoted', performanceId: string }
    | { type: 'conflict', prompt: ConflictPrompt }

export interface PickTransition {
  picks: PickMap
  effects: PickEffect[]
}

function cloneWith(picks: PickMap, ...updates: Pick[]): PickMap {
  const next = { ...picks }
  for (const u of updates) next[u.performanceId] = u
  return next
}

function byId(schedule: EffectivePerformance[]): Map<string, EffectivePerformance> {
  return new Map(schedule.map(p => [p.performanceId, p]))
}

/** Preferred, non-skipped picks as schedule entries. */
function preferredEntries(picks: PickMap, schedule: EffectivePerformance[]): EffectivePerformance[] {
  return schedule.filter(p => picks[p.performanceId]?.status === 'preferred')
}

/**
 * O-4 resolution: winner → preferred, every other performance in the group →
 * backburner. A pick that was ALREADY backburner keeps its explicit C19/C23
 * choice; fresh demotions take the plan's backburner-notify default.
 */
export function resolveConflict(
  picks: PickMap,
  groupIds: string[],
  winnerId: string,
  backburnerNotifyDefault = false,
): PickTransition {
  const updates: Pick[] = groupIds.map(id => id === winnerId
    ? { performanceId: id, status: 'preferred', notifyOptIn: false }
    : {
        performanceId: id,
        status: 'backburner',
        notifyOptIn: picks[id]?.status === 'backburner'
          ? picks[id]!.notifyOptIn
          : backburnerNotifyDefault,
      })
  return { picks: cloneWith(picks, ...updates), effects: [] }
}

/**
 * O-3 / W-4: select a performance (new pick or re-pick of a skipped one) as
 * preferred. If it overlaps existing preferred picks, the O-4 prompt is
 * returned — statuses stay provisional-preferred until the user answers.
 */
export function addPick(picks: PickMap, schedule: EffectivePerformance[], performanceId: string): PickTransition {
  const next = cloneWith(picks, { performanceId, status: 'preferred', notifyOptIn: false })
  const prompts = detectUnresolvedConflicts(next, schedule)
  const involving = prompts.find(p => p.performanceIds.includes(performanceId))
  return {
    picks: next,
    effects: involving ? [{ type: 'conflict', prompt: involving }] : [],
  }
}

/**
 * Backburner promotion cascade after a preferred pick leaves the schedule
 * (skip C17 or removal via override). Backburners that no longer conflict
 * with ANY preferred pick get promoted; if several such candidates conflict
 * with each other, the user gets an O-4 prompt instead of a guess.
 */
export function promoteFreedBackburners(picks: PickMap, schedule: EffectivePerformance[]): PickTransition {
  const map = byId(schedule)
  const preferred = preferredEntries(picks, schedule)
  const candidates = Object.values(picks)
    .filter(p => p.status === 'backburner')
    .map(p => map.get(p.performanceId))
    .filter((p): p is EffectivePerformance => p !== undefined)
    .filter(p => preferred.every(pref => !overlaps(pref, p)))

  if (candidates.length === 0) return { picks, effects: [] }

  const effects: PickEffect[] = []
  const updates: Pick[] = []
  const mutualGroups = findConflictGroups(candidates)
  const inGroup = new Set(mutualGroups.flat())

  // Candidates free of mutual conflicts → promote
  for (const p of candidates.filter(c => !inGroup.has(c))) {
    updates.push({ performanceId: p.performanceId, status: 'preferred', notifyOptIn: false })
    effects.push({ type: 'promoted', performanceId: p.performanceId })
  }
  // Mutually conflicting candidates → O-4 prompt, statuses unchanged
  for (const group of mutualGroups) {
    effects.push({
      type: 'conflict',
      prompt: { dayIndex: group[0]!.dayIndex, performanceIds: group.map(g => g.performanceId) },
    })
  }
  return { picks: cloneWith(picks, ...updates), effects }
}

/** C17 "Skip this one" — cancel watching; promotes freed backburners. */
export function skipPick(picks: PickMap, schedule: EffectivePerformance[], performanceId: string): PickTransition {
  const existing = picks[performanceId]
  if (!existing) return { picks, effects: [] }
  const next = cloneWith(picks, { performanceId, status: 'skipped', notifyOptIn: false })
  if (existing.status !== 'preferred') return { picks: next, effects: [] }
  return promoteFreedBackburners(next, schedule)
}

/**
 * Removal via override (performer cancelled): the pick row is dropped
 * entirely, then the promotion cascade runs. Call with the schedule AFTER
 * the removal override is applied.
 */
export function removePick(picks: PickMap, scheduleAfterRemoval: EffectivePerformance[], performanceId: string): PickTransition {
  const existing = picks[performanceId]
  const next = { ...picks }
  delete next[performanceId]
  if (existing?.status !== 'preferred') return { picks: next, effects: [] }
  return promoteFreedBackburners(next, scheduleAfterRemoval)
}

/**
 * C18 "Make this my pick": a backburner swaps with the preferred pick(s) it
 * overlaps. Returns the demoted ids so the UI can toast C29
 * ("{artist} is your pick — {other} goes to the backburner").
 */
export function swapPreferred(
  picks: PickMap,
  schedule: EffectivePerformance[],
  performanceId: string,
  backburnerNotifyDefault = false,
): PickTransition & { demoted: string[] } {
  const map = byId(schedule)
  const target = map.get(performanceId)
  const pick = picks[performanceId]
  if (!target || pick?.status !== 'backburner')
    return { picks, effects: [], demoted: [] }

  const demoted = preferredEntries(picks, schedule)
    .filter(p => overlaps(p, target))
    .map(p => p.performanceId)

  const updates: Pick[] = [
    { performanceId, status: 'preferred', notifyOptIn: false },
    ...demoted.map(id => ({
      performanceId: id,
      status: 'backburner' as const,
      // freshly demoted from preferred → take the plan default
      notifyOptIn: backburnerNotifyDefault,
    })),
  ]
  return { picks: cloneWith(picks, ...updates), effects: [], demoted }
}

/** C19/C23: backburner-only notification opt-in toggle. */
export function setNotifyOptIn(picks: PickMap, performanceId: string, on: boolean): PickTransition {
  const pick = picks[performanceId]
  if (pick?.status !== 'backburner') return { picks, effects: [] }
  return {
    picks: cloneWith(picks, { ...pick, notifyOptIn: on }),
    effects: [],
  }
}
