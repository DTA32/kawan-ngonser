import { describe, expect, it } from 'vitest'
import { applyOverrides, makeRemoval, makeTimeOverride } from '~/domain/overrides'
import type { OverrideMap } from '~/domain/types'
import { P, t } from '../fixtures/mini'

const perfs = [P.a, P.b, P.c]

describe('applyOverrides', () => {
  it('passes through untouched performances with overridden=false', () => {
    const out = applyOverrides(perfs, {})
    expect(out).toHaveLength(3)
    expect(out.every(p => !p.overridden)).toBe(true)
  })

  it('replaces times and flags provenance', () => {
    const overrides: OverrideMap = {
      a: makeTimeOverride('a', t('2026-08-07T18:00:00'), t('2026-08-07T18:45:00')),
    }
    const out = applyOverrides(perfs, overrides)
    const a = out.find(p => p.performanceId === 'a')!
    expect(a.startMs).toBe(t('2026-08-07T18:00:00'))
    expect(a.endMs).toBe(t('2026-08-07T18:45:00'))
    expect(a.overridden).toBe(true)
    expect(out.find(p => p.performanceId === 'b')!.overridden).toBe(false)
  })

  it('filters out removed performances', () => {
    const out = applyOverrides(perfs, { b: makeRemoval('b') })
    expect(out.map(p => p.performanceId).sort()).toEqual(['a', 'c'])
  })

  it('re-sorts after a time change moves a performance', () => {
    const overrides: OverrideMap = {
      c: makeTimeOverride('c', t('2026-08-07T10:00:00'), t('2026-08-07T11:00:00')),
    }
    const out = applyOverrides(perfs, overrides)
    expect(out[0]!.performanceId).toBe('c')
  })
})
