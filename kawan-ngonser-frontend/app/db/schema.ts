/**
 * IndexedDB via Dexie — mirrors indexeddb.mermaid (rows stay snake_case like
 * the diagram; repos map to canonical domain types). One deliberate addition:
 * `local_kv` for the app-config cache and the notification schedule/ledger
 * (flagged back to the team — not in the mermaid yet).
 *
 * Times in rows are epoch ms — except `local_concert_builds`, which stores
 * naive venue-local strings because a build's day can be re-dated (see the
 * header of domain/builds.ts). Theme is NOT here (localStorage — must be
 * readable pre-paint, §3.4).
 */
import Dexie, { type Table } from 'dexie'
import type { BuildOrigin } from '~/domain/builds'
import type { Concert, ConflictDisplayPref, PickStatus, TimetableViewPref, WidgetId } from '~/domain/types'

export interface CacheRow {
  event_id: string
  version: number
  /** 'builder' = materialized from a local build via B-12 "Plan this concert" */
  source: 'server' | 'json_upload' | 'builder'
  /** Payload exactly as received — re-normalizable after normalizer fixes */
  payload: unknown
  /** Canonical form for fast boot */
  normalized: Concert
  fetched_at: number
}

export interface PlanRow {
  event_id: string
  attending_day_indexes: number[]
  conflict_display_pref: ConflictDisplayPref
  /** Optional for pre-existing rows — hydrates as false */
  backburner_notify_default?: boolean
  /** Optional for pre-existing rows — hydrates as 'compact' (W-2) */
  timetable_view_pref?: TimetableViewPref
  widget_order: WidgetId[]
  /** Optional for pre-existing rows — hydrates as [] (S-1 show/hide) */
  hidden_widgets?: WidgetId[]
  lead_time_override_min: number | null
}

export interface PickRow {
  event_id: string
  performance_id: string
  status: PickStatus
  notify_opt_in: boolean
}

export interface CustomEventRow {
  custom_event_id: string
  event_id: string
  name: string
  start_time: number
  end_time: number | null
}

export interface OverrideRow {
  event_id: string
  performance_id: string
  new_start_time: number | null
  new_end_time: number | null
  removed: boolean
}

export interface KvRow {
  key: string
  value: unknown
}

/**
 * §3.5 — a user-authored concert (§13). Mirrors the Mongo `concerts` document
 * rather than any server-held user state, plus four local-only bookkeeping
 * fields. Deliberately NOT a cache row: a build may be incomplete, it never
 * shows in the H-2 lists, and editing it must not mutate a concert already
 * planned from it (B-12). Times are naive venue-local strings, not epoch ms —
 * see the header of domain/builds.ts for why.
 */
export interface BuildRow {
  build_id: string
  event_id: string
  version: number
  name: string
  logo: string
  place: string
  description: string
  timezone: string
  days: { day_index: number, date: string }[]
  stages: { stage_id: string, name: string, color: string }[]
  performances: {
    performance_id: string
    artist_name: string
    artist_image: string
    day_index: number
    stage_id: string
    start_time: string
    end_time: string
  }[]
  origin: BuildOrigin
  forked_from_event_id: string | null
  created_at: number
  updated_at: number
}

export class KawanDB extends Dexie {
  local_concert_cache!: Table<CacheRow, string>
  local_plans!: Table<PlanRow, string>
  local_picks!: Table<PickRow, [string, string]>
  local_custom_events!: Table<CustomEventRow, string>
  local_performance_overrides!: Table<OverrideRow, [string, string]>
  local_kv!: Table<KvRow, string>
  local_concert_builds!: Table<BuildRow, string>

  constructor(name = 'kawan-ngonser') {
    super(name)
    this.version(1).stores({
      local_concert_cache: 'event_id',
      local_plans: 'event_id',
      local_picks: '[event_id+performance_id], event_id',
      local_custom_events: 'custom_event_id, event_id',
      local_performance_overrides: '[event_id+performance_id], event_id',
      local_kv: 'key',
    })
    // v2 — Concert Builder (§13). Dexie carries unchanged tables forward, so
    // only the new store is listed. `event_id` is indexed for the B-11
    // uniqueness check; `updated_at` for the B-2 most-recently-edited order.
    this.version(2).stores({
      local_concert_builds: 'build_id, event_id, updated_at',
    })
  }
}

let instance: KawanDB | null = null

export function getDB(): KawanDB {
  instance ??= new KawanDB()
  return instance
}

/** Test hook: swap in a throwaway DB (fake-indexeddb). */
export function setDB(db: KawanDB): void {
  instance = db
}
