/**
 * Local performance overrides (W-2 edit affordance): time changes + removals,
 * applied over the cached payload. `hasLocalEdits` drives the C12 warning.
 */
import type { EffectivePerformance, OverrideMap, Performance, PerformanceOverride } from './types'

/** Removed performances are filtered OUT; time overrides replace start/end. */
export function applyOverrides(perfs: Performance[], overrides: OverrideMap): EffectivePerformance[] {
  const out: EffectivePerformance[] = []
  for (const p of perfs) {
    const o = overrides[p.performanceId]
    if (o?.removed) continue
    if (o) {
      out.push({
        ...p,
        startMs: o.newStartMs ?? p.startMs,
        endMs: o.newEndMs ?? p.endMs,
        overridden: true,
      })
    }
    else {
      out.push({ ...p, overridden: false })
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs)
}

export function makeTimeOverride(performanceId: string, newStartMs: number, newEndMs: number): PerformanceOverride {
  return { performanceId, newStartMs, newEndMs, removed: false }
}

export function makeRemoval(performanceId: string): PerformanceOverride {
  return { performanceId, newStartMs: null, newEndMs: null, removed: true }
}
