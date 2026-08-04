/**
 * Canonical internal types. All timestamps are epoch milliseconds — Luxon and
 * the concert's IANA timezone appear only at the parse/format boundaries
 * (domain/time.ts), so comparisons and scheduling are plain number math and
 * the device timezone never affects correctness.
 */

export interface Concert {
  eventId: string
  version: number
  name: string
  logo: string
  place: string
  description: string
  /** IANA zone, e.g. Asia/Jakarta — all display goes through it */
  timezone: string
  days: ConcertDay[]
  stages: Stage[]
  performances: Performance[]
}

export interface ConcertDay {
  /** 1-based, unique within the concert */
  dayIndex: number
  /** YYYY-MM-DD, venue-local */
  date: string
}

export interface Stage {
  stageId: string
  name: string
  /** Untrusted hex — clamp via utils/stage-color before rendering */
  color: string
}

export interface Performance {
  performanceId: string
  artistName: string
  artistImage: string
  dayIndex: number
  stageId: string
  startMs: number
  endMs: number
}

/** Summary row from GET /concerts (no performances payload). */
export interface ConcertSummary {
  eventId: string
  version: number
  name: string
  logo: string
  place: string
  description: string
  timezone: string
  days: ConcertDay[]
}

// ---------------------------------------------------------------------------
// Local user data (mirrors indexeddb.mermaid)
// ---------------------------------------------------------------------------

export type PickStatus = 'preferred' | 'backburner' | 'skipped'

export interface Pick {
  performanceId: string
  status: PickStatus
  /** Backburner-only notification opt-in (N-1c, C19/C23) */
  notifyOptIn: boolean
}

/** Keyed by performanceId. */
export type PickMap = Record<string, Pick>

export type ConflictDisplayPref = 'equal' | 'hidden'

export interface PlanSettings {
  eventId: string
  attendingDayIndexes: number[]
  conflictDisplayPref: ConflictDisplayPref
  /**
   * When true, performances that become backburner default to notifying
   * (N-1c flips from opt-in to opt-out). Per-performance C19/C23 toggles
   * still override individually. Default false (spec: silent by default).
   */
  backburnerNotifyDefault: boolean
  widgetOrder: WidgetId[]
  /** null → fall back to app config (S-2) */
  leadTimeOverrideMin: number | null
}

export type WidgetId = 'upNext' | 'timetable' | 'backburner' | 'other' | 'nextDays'

export const DEFAULT_WIDGET_ORDER: WidgetId[] = ['upNext', 'timetable', 'backburner', 'other', 'nextDays']

export interface CustomEvent {
  customEventId: string
  name: string
  startMs: number
  endMs: number | null
}

export interface PerformanceOverride {
  performanceId: string
  newStartMs: number | null
  newEndMs: number | null
  /** Performer cancelled (W-2) */
  removed: boolean
}

/** Keyed by performanceId. */
export type OverrideMap = Record<string, PerformanceOverride>

// ---------------------------------------------------------------------------
// Derived
// ---------------------------------------------------------------------------

/** A performance with local overrides applied + provenance flags. */
export interface EffectivePerformance extends Performance {
  overridden: boolean
}

export type ScheduleEntry
  = | { kind: 'performance', startMs: number, endMs: number, dayIndex: number, performance: EffectivePerformance }
    | { kind: 'custom', startMs: number, endMs: number, dayIndex: number, event: CustomEvent }

export interface EffectiveSchedule {
  /** Sorted by startMs, grouped by dayIndex */
  byDay: Map<number, ScheduleEntry[]>
  performances: EffectivePerformance[]
  /** dayIndex → [windowStartMs, windowEndMs] (extends past midnight) */
  dayWindows: Map<number, [number, number]>
}

/** Prompt for the O-4 "Schedule clash! Who gets you?" sheet. */
export interface ConflictPrompt {
  dayIndex: number
  performanceIds: string[]
}

// ---------------------------------------------------------------------------
// App config (§3.2, mirrors app_configs with built-in defaults)
// ---------------------------------------------------------------------------

export interface NotificationTemplate {
  type: 'performance' | 'custom_event'
  title: string
  body: string
}

/** copy_strings values are mixed: plain strings or banner objects. */
export type CopyValue = string | { text: string, confirm?: string, dismiss?: string }

export interface AppConfig {
  defaultLeadTimeMin: number
  batteryLowThresholdPct: number
  notificationTemplates: NotificationTemplate[]
  copyStrings: Record<string, CopyValue>
}
