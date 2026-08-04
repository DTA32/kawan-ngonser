import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseConcertPayload } from '~/domain/normalize'
import { miniDraftPayload } from '../fixtures/mini'

function loadFixture(name: string) {
  return JSON.parse(readFileSync(
    fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)),
    'utf-8',
  ))
}

/** What GET /concerts/:id actually serves: §3.1 camelCase, naive wall times. */
const wireFixture = loadFixture('sounds-project-2026.wire.json')
/** The Mongo seed shape (snake_case) — tolerated fallback for direct uploads. */
const seedFixture = loadFixture('sounds-project-2026.api.json')

function clone<T>(v: T): T {
  return structuredClone(v)
}

describe('parseConcertPayload — wire contract (camelCase, naive wall times)', () => {
  it('parses the 128-performance payload without warnings', () => {
    const res = parseConcertPayload(wireFixture)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.concert.eventId).toBe('sounds-project-2026')
    expect(res.concert.timezone).toBe('Asia/Jakarta')
    expect(res.concert.days).toHaveLength(3)
    expect(res.concert.stages).toHaveLength(7)
    expect(res.concert.performances).toHaveLength(128)
    expect(res.warnings).toEqual([])
  })

  it('interprets naive wall times in the venue zone and sorts by start', () => {
    const res = parseConcertPayload(wireFixture)
    if (!res.ok) throw new Error('parse failed')
    const juicy = res.concert.performances.find(p => p.performanceId === 'tsp-d1-juicy-luicy')!
    expect(juicy.startMs).toBe(Date.UTC(2026, 7, 7, 8, 30)) // 15:30 Jakarta
    const starts = res.concert.performances.map(p => p.startMs)
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)
  })

  it('keeps midnight-spill sets on their original dayIndex', () => {
    const res = parseConcertPayload(wireFixture)
    if (!res.ok) throw new Error('parse failed')
    const late = res.concert.performances.find(p => p.performanceId === 'tsp-d1-the-adams')!
    expect(late.dayIndex).toBe(1)
    expect(late.endMs).toBeGreaterThan(late.startMs)
  })

  it('accepts Z-suffixed UTC strings as the same instant', () => {
    const utc = clone(wireFixture)
    utc.performances = utc.performances.slice(0, 1)
    utc.performances[0].start = '2026-08-07T08:30:00.000Z'
    utc.performances[0].end = '2026-08-07T09:30:00.000Z'
    const res = parseConcertPayload(utc)
    if (!res.ok) throw new Error('parse failed')
    expect(res.concert.performances[0]!.startMs).toBe(Date.UTC(2026, 7, 7, 8, 30))
  })

  it('parses the mini draft payload without warnings', () => {
    const res = parseConcertPayload(miniDraftPayload)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.warnings).toEqual([])
    const a = res.concert.performances.find(p => p.performanceId === 'a')!
    expect(a.startMs).toBe(Date.UTC(2026, 7, 7, 12, 0)) // 19:00 Jakarta
  })
})

describe('parseConcertPayload — seed-shape fallback (snake_case)', () => {
  it('parses with a shape warning', () => {
    const res = parseConcertPayload(seedFixture)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.warnings).toContain('payload uses the snake_case seed shape')
    expect(res.concert.performances).toHaveLength(128)
    const juicy = res.concert.performances.find(p => p.performanceId === 'tsp-d1-juicy-luicy')!
    expect(juicy.startMs).toBe(Date.UTC(2026, 7, 7, 8, 30)) // +07:00 offset form
  })

  it('accepts Mongo {$date} wrappers and a one-element array wrapper', () => {
    const wrapped = clone(seedFixture)
    for (const p of wrapped.performances) {
      p.start_time = { $date: p.start_time }
      p.end_time = { $date: p.end_time }
    }
    const res = parseConcertPayload([wrapped])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.warnings).toContain('payload was a one-element array — unwrapped it')
  })
})

describe('parseConcertPayload — friendly rejection (C26 path)', () => {
  it('rejects non-objects', () => {
    expect(parseConcertPayload('nope').ok).toBe(false)
    expect(parseConcertPayload(null).ok).toBe(false)
    expect(parseConcertPayload([1, 2]).ok).toBe(false)
  })

  it('reports missing fields against the wire contract', () => {
    const res = parseConcertPayload({ name: 'x' })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.errors.join('\n')).toContain('timezone')
  })

  it('rejects an invalid IANA timezone', () => {
    const bad = clone(wireFixture)
    bad.timezone = 'Mars/Olympus_Mons'
    const res = parseConcertPayload(bad)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.errors[0]).toContain('timezone')
  })

  it('rejects unknown stage/day references with locations', () => {
    const bad = clone(wireFixture)
    bad.performances[3].stageId = 'ghost-stage'
    bad.performances[5].dayIndex = 99
    const res = parseConcertPayload(bad)
    expect(res.ok).toBe(false)
    if (res.ok) return
    const text = res.errors.join('\n')
    expect(text).toContain('ghost-stage')
    expect(text).toContain('day index 99')
  })

  it('rejects end-before-start and duplicate ids', () => {
    const bad = clone(wireFixture)
    bad.performances[0].end = '2026-08-07T15:00:00' // before its 15:30 start
    bad.performances[2].id = bad.performances[1].id
    const res = parseConcertPayload(bad)
    expect(res.ok).toBe(false)
    if (res.ok) return
    const text = res.errors.join('\n')
    expect(text).toContain('end is not after start')
    expect(text).toContain('duplicate performance id')
  })

  it('rejects unparseable times', () => {
    const bad = clone(wireFixture)
    bad.performances[0].start = 'half past eight'
    const res = parseConcertPayload(bad)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.errors.join('\n')).toContain('unparseable start time')
  })
})
