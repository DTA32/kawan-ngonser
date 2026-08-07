import { describe, expect, it } from 'vitest'
import {
  classify,
  type ConnectionQuality,
  retain,
  type Sample,
  SLOW_RTT_MS,
  STALE_AFTER_MS,
} from '~/domain/connectionQuality'

const NOW = 1_700_000_000_000

/** Samples spaced a second apart, ending at NOW. */
function samplesOf(...specs: Array<number | 'fail'>): Sample[] {
  return specs.map((spec, i) => ({
    atMs: NOW - (specs.length - 1 - i) * 1_000,
    rttMs: spec === 'fail' ? null : spec,
    ok: spec !== 'fail',
  }))
}

const FAST = 120
const SLOW = SLOW_RTT_MS + 500

/** Feed samples in one at a time so hysteresis actually gets exercised. */
function run(specs: Array<number | 'fail'>, from: ConnectionQuality = 'good'): ConnectionQuality {
  const all = samplesOf(...specs)
  let state = from
  for (let i = 1; i <= all.length; i++)
    state = classify(all.slice(0, i), state, NOW)
  return state
}

describe('classify', () => {
  it('reads a healthy connection as good', () => {
    expect(run([FAST, FAST, FAST])).toBe('good')
  })

  it('never warns with nothing to go on', () => {
    expect(classify([], 'good', NOW)).toBe('good')
  })

  it('needs two slow samples in a row — one does not flip it', () => {
    expect(run([FAST, SLOW])).toBe('good')
    expect(run([FAST, SLOW, SLOW])).toBe('slow')
  })

  it('needs two fast samples in a row to recover from slow', () => {
    expect(run([SLOW, SLOW, FAST])).toBe('slow')
    expect(run([SLOW, SLOW, FAST, FAST])).toBe('good')
  })

  it('does not flap when round trips straddle the threshold', () => {
    expect(run([SLOW, FAST, SLOW, FAST, SLOW])).toBe('good')
  })

  it('reads two consecutive failures as unreachable', () => {
    expect(run([FAST, 'fail'])).toBe('good')
    expect(run([FAST, 'fail', 'fail'])).toBe('unreachable')
  })

  it('needs a streak of successes to recover from unreachable', () => {
    expect(run(['fail', 'fail', FAST])).toBe('unreachable')
    expect(run(['fail', 'fail', FAST, FAST])).toBe('good')
  })

  it('recovers from unreachable straight into slow when it is still bad', () => {
    expect(run(['fail', 'fail', SLOW, SLOW])).toBe('slow')
  })

  it('falls back to good once every sample is stale', () => {
    const old = samplesOf(SLOW, SLOW).map(s => ({ ...s, atMs: s.atMs - STALE_AFTER_MS }))
    expect(classify(old, 'slow', NOW)).toBe('good')
  })

  it('treats a round trip exactly at the threshold as fast', () => {
    expect(run([SLOW_RTT_MS, SLOW_RTT_MS])).toBe('good')
  })
})

describe('retain', () => {
  it('keeps only the freshest window', () => {
    const many = samplesOf(1, 2, 3, 4, 5)
    expect(retain(many, NOW).map(s => s.rttMs)).toEqual([3, 4, 5])
  })

  it('drops stale samples', () => {
    const mixed = [
      { atMs: NOW - STALE_AFTER_MS - 1, rttMs: 1, ok: true },
      { atMs: NOW - 1_000, rttMs: 2, ok: true },
    ]
    expect(retain(mixed, NOW).map(s => s.rttMs)).toEqual([2])
  })
})
