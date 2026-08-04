import { describe, expect, it } from 'vitest'
import { detectUnresolvedConflicts, findConflictGroups, overlaps } from '~/domain/conflicts'
import type { PickMap } from '~/domain/types'
import { P } from '../fixtures/mini'

describe('overlaps', () => {
  it('detects a 1-minute overlap', () => {
    expect(overlaps(P.a, P.b)).toBe(true) // 19:00–20:00 vs 19:59–21:00
  })

  it('does NOT treat touching boundaries as a conflict', () => {
    expect(overlaps(P.b, P.c)).toBe(false) // ends 21:00 / starts 21:00
  })

  it('is symmetric', () => {
    expect(overlaps(P.b, P.a)).toBe(true)
    expect(overlaps(P.c, P.b)).toBe(false)
  })
})

describe('findConflictGroups', () => {
  it('groups transitive overlaps (3-way chain where the ends do not overlap)', () => {
    // d 15:00–16:00 ↔ e 15:30–16:30 ↔ f 16:15–17:00; d/f don't overlap
    const groups = findConflictGroups([P.d, P.e, P.f])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.map(p => p.performanceId).sort()).toEqual(['d', 'e', 'f'])
  })

  it('keeps non-overlapping performances out of groups', () => {
    const groups = findConflictGroups([P.a, P.b, P.c, P.late])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.map(p => p.performanceId).sort()).toEqual(['a', 'b'])
  })

  it('returns nothing for an empty or conflict-free schedule', () => {
    expect(findConflictGroups([])).toEqual([])
    expect(findConflictGroups([P.a, P.c, P.late])).toEqual([])
  })
})

describe('detectUnresolvedConflicts', () => {
  const schedule = [P.a, P.b, P.c].map(p => ({ ...p, overridden: false }))

  it('prompts when two PREFERRED picks overlap', () => {
    const picks: PickMap = {
      a: { performanceId: 'a', status: 'preferred', notifyOptIn: false },
      b: { performanceId: 'b', status: 'preferred', notifyOptIn: false },
    }
    const prompts = detectUnresolvedConflicts(picks, schedule)
    expect(prompts).toHaveLength(1)
    expect(prompts[0]!.performanceIds.sort()).toEqual(['a', 'b'])
    expect(prompts[0]!.dayIndex).toBe(1)
  })

  it('stays silent when the conflict is already resolved (one backburner)', () => {
    const picks: PickMap = {
      a: { performanceId: 'a', status: 'preferred', notifyOptIn: false },
      b: { performanceId: 'b', status: 'backburner', notifyOptIn: false },
    }
    expect(detectUnresolvedConflicts(picks, schedule)).toEqual([])
  })

  it('ignores skipped and unpicked performances', () => {
    const picks: PickMap = {
      a: { performanceId: 'a', status: 'preferred', notifyOptIn: false },
      b: { performanceId: 'b', status: 'skipped', notifyOptIn: false },
    }
    expect(detectUnresolvedConflicts(picks, schedule)).toEqual([])
  })
})
