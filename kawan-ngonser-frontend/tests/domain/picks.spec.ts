import { describe, expect, it } from 'vitest'
import {
  addPick,
  removePick,
  resolveConflict,
  setNotifyOptIn,
  skipPick,
  swapPreferred,
} from '~/domain/picks'
import type { EffectivePerformance, PickMap } from '~/domain/types'
import { P } from '../fixtures/mini'

const schedule: EffectivePerformance[] = Object.values(P).map(p => ({ ...p, overridden: false }))

function picksOf(entries: Array<[string, 'preferred' | 'backburner' | 'skipped', boolean?]>): PickMap {
  return Object.fromEntries(entries.map(([id, status, opt]) => [
    id,
    { performanceId: id, status, notifyOptIn: opt ?? false },
  ]))
}

describe('resolveConflict', () => {
  it('makes the winner preferred and the rest backburner', () => {
    const start = picksOf([['a', 'preferred'], ['b', 'preferred']])
    const { picks } = resolveConflict(start, ['a', 'b'], 'b')
    expect(picks.b!.status).toBe('preferred')
    expect(picks.a!.status).toBe('backburner')
  })

  it('preserves loser opt-ins and clears the winner\'s', () => {
    const start = picksOf([['a', 'backburner', true], ['b', 'preferred']])
    const { picks } = resolveConflict(start, ['a', 'b'], 'a')
    expect(picks.a!.status).toBe('preferred')
    expect(picks.a!.notifyOptIn).toBe(false) // preferred always notifies
    expect(picks.b!.notifyOptIn).toBe(false)
  })

  it('fresh demotions take the backburner-notify default when enabled', () => {
    const start = picksOf([['a', 'preferred'], ['b', 'preferred']])
    const { picks } = resolveConflict(start, ['a', 'b'], 'a', true)
    expect(picks.b!.status).toBe('backburner')
    expect(picks.b!.notifyOptIn).toBe(true)
  })

  it('an existing backburner keeps its explicit choice over the default', () => {
    // b already backburner with notify explicitly OFF; re-resolution with
    // default ON must not overwrite the per-set choice
    const start = picksOf([['a', 'preferred'], ['b', 'backburner', false]])
    const { picks } = resolveConflict(start, ['a', 'b'], 'a', true)
    expect(picks.b!.notifyOptIn).toBe(false)
  })
})

describe('addPick (O-3 / W-4 "Watch this")', () => {
  it('adds as preferred with no conflict effect when free', () => {
    const { picks, effects } = addPick({}, schedule, 'c')
    expect(picks.c!.status).toBe('preferred')
    expect(effects).toEqual([])
  })

  it('returns the O-4 prompt when the new pick overlaps a preferred one', () => {
    const start = picksOf([['a', 'preferred']])
    const { picks, effects } = addPick(start, schedule, 'b')
    expect(picks.b!.status).toBe('preferred') // provisional until resolved
    expect(effects).toHaveLength(1)
    expect(effects[0]).toMatchObject({ type: 'conflict' })
    if (effects[0]!.type === 'conflict')
      expect(effects[0]!.prompt.performanceIds.sort()).toEqual(['a', 'b'])
  })

  it('re-adds a skipped performance', () => {
    const start = picksOf([['c', 'skipped']])
    const { picks } = addPick(start, schedule, 'c')
    expect(picks.c!.status).toBe('preferred')
  })
})

describe('skipPick (C17) + backburner auto-promotion', () => {
  it('promotes the freed backburner', () => {
    const start = picksOf([['a', 'preferred'], ['b', 'backburner', true]])
    const { picks, effects } = skipPick(start, schedule, 'a')
    expect(picks.a!.status).toBe('skipped')
    expect(picks.b!.status).toBe('preferred')
    expect(picks.b!.notifyOptIn).toBe(false) // opt-in cleared on promotion
    expect(effects).toContainEqual({ type: 'promoted', performanceId: 'b' })
  })

  it('does not promote a backburner still conflicting with another preferred', () => {
    // 3-way: d↔e, e↔f. e backburner; skip d — e still overlaps preferred f
    const start = picksOf([['d', 'preferred'], ['e', 'backburner'], ['f', 'preferred']])
    const { picks, effects } = skipPick(start, schedule, 'd')
    expect(picks.e!.status).toBe('backburner')
    expect(effects).toEqual([])
  })

  it('prompts instead of guessing when two freed backburners conflict', () => {
    // d preferred; e and f both backburner (e↔f overlap). Skipping d frees both.
    const start = picksOf([['d', 'preferred'], ['e', 'backburner'], ['f', 'backburner']])
    const { picks, effects } = skipPick(start, schedule, 'd')
    expect(picks.e!.status).toBe('backburner')
    expect(picks.f!.status).toBe('backburner')
    expect(effects).toHaveLength(1)
    expect(effects[0]).toMatchObject({ type: 'conflict' })
    if (effects[0]!.type === 'conflict')
      expect(effects[0]!.prompt.performanceIds.sort()).toEqual(['e', 'f'])
  })

  it('skipping a backburner promotes nothing', () => {
    const start = picksOf([['a', 'preferred'], ['b', 'backburner']])
    const { picks, effects } = skipPick(start, schedule, 'b')
    expect(picks.b!.status).toBe('skipped')
    expect(picks.a!.status).toBe('preferred')
    expect(effects).toEqual([])
  })
})

describe('removePick (performer cancelled)', () => {
  it('drops the pick row and promotes its backburner', () => {
    const start = picksOf([['a', 'preferred'], ['b', 'backburner']])
    const after = schedule.filter(p => p.performanceId !== 'a')
    const { picks, effects } = removePick(start, after, 'a')
    expect(picks.a).toBeUndefined()
    expect(picks.b!.status).toBe('preferred')
    expect(effects).toContainEqual({ type: 'promoted', performanceId: 'b' })
  })
})

describe('swapPreferred (C18)', () => {
  it('swaps a backburner with the preferred it overlaps', () => {
    const start = picksOf([['a', 'preferred'], ['b', 'backburner']])
    const { picks, demoted } = swapPreferred(start, schedule, 'b')
    expect(picks.b!.status).toBe('preferred')
    expect(picks.a!.status).toBe('backburner')
    expect(demoted).toEqual(['a'])
  })

  it('no-ops on a non-backburner target', () => {
    const start = picksOf([['a', 'preferred']])
    const { picks, demoted } = swapPreferred(start, schedule, 'a')
    expect(picks).toEqual(start)
    expect(demoted).toEqual([])
  })

  it('demotions from a swap take the backburner-notify default', () => {
    const start = picksOf([['a', 'preferred'], ['b', 'backburner']])
    const { picks } = swapPreferred(start, schedule, 'b', true)
    expect(picks.a!.status).toBe('backburner')
    expect(picks.a!.notifyOptIn).toBe(true)
    expect(picks.b!.notifyOptIn).toBe(false) // promoted → preferred always notifies
  })
})

describe('setNotifyOptIn (C19/C23)', () => {
  it('toggles only on backburner picks', () => {
    const start = picksOf([['a', 'preferred'], ['b', 'backburner']])
    expect(setNotifyOptIn(start, 'b', true).picks.b!.notifyOptIn).toBe(true)
    expect(setNotifyOptIn(start, 'a', true).picks.a!.notifyOptIn).toBe(false)
  })
})
