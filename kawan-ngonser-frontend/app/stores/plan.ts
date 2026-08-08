/**
 * Per-concert plans: settings + picks + custom events + overrides
 * (local_plans / local_picks / local_custom_events / local_performance_overrides).
 * Memory-first mutations with write-through persistence (C31 on failure).
 * Pick-transition logic (conflict resolution, promotion) lives in domain/picks
 * — this store only owns state + persistence.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { CustomEventRow, OverrideRow, PickRow, PlanRow } from '~/db/schema'
import { getDB } from '~/db/schema'
import { customEventsRepo } from '~/db/repos/customEventsRepo'
import { overridesRepo } from '~/db/repos/overridesRepo'
import { picksRepo } from '~/db/repos/picksRepo'
import { planRepo } from '~/db/repos/planRepo'
import {
  type ConflictDisplayPref,
  type CustomEvent,
  DEFAULT_WIDGET_ORDER,
  type OverrideMap,
  type PerformanceOverride,
  type PickMap,
  type PlanSettings,
  reconcileWidgetOrder,
  type TimetableViewPref,
  type WidgetId,
} from '~/domain/types'
import { persist } from '~/utils/persist-feedback'

export interface PlanState {
  settings: PlanSettings
  picks: PickMap
  customEvents: CustomEvent[]
  overrides: OverrideMap
}

function settingsToRow(s: PlanSettings): PlanRow {
  return {
    event_id: s.eventId,
    attending_day_indexes: [...s.attendingDayIndexes],
    conflict_display_pref: s.conflictDisplayPref,
    backburner_notify_default: s.backburnerNotifyDefault,
    timetable_view_pref: s.timetableViewPref,
    widget_order: [...s.widgetOrder],
    hidden_widgets: [...s.hiddenWidgets],
    lead_time_override_min: s.leadTimeOverrideMin,
  }
}

function pickRows(eventId: string, picks: PickMap): PickRow[] {
  return Object.values(picks).map(p => ({
    event_id: eventId,
    performance_id: p.performanceId,
    status: p.status,
    notify_opt_in: p.notifyOptIn,
  }))
}

function eventToRow(eventId: string, e: CustomEvent): CustomEventRow {
  return {
    custom_event_id: e.customEventId,
    event_id: eventId,
    name: e.name,
    start_time: e.startMs,
    end_time: e.endMs,
  }
}

function overrideToRow(eventId: string, o: PerformanceOverride): OverrideRow {
  return {
    event_id: eventId,
    performance_id: o.performanceId,
    new_start_time: o.newStartMs,
    new_end_time: o.newEndMs,
    removed: o.removed,
  }
}

export const usePlanStore = defineStore('plan', () => {
  const plans = ref(new Map<string, PlanState>())
  const hydrated = ref(false)

  function hydrate(
    planRows: PlanRow[],
    picks: PickRow[],
    events: CustomEventRow[],
    overrides: OverrideRow[],
  ): void {
    const map = new Map<string, PlanState>()
    for (const row of planRows) {
      map.set(row.event_id, {
        settings: {
          eventId: row.event_id,
          attendingDayIndexes: row.attending_day_indexes,
          conflictDisplayPref: row.conflict_display_pref,
          backburnerNotifyDefault: row.backburner_notify_default ?? false,
          timetableViewPref: row.timetable_view_pref ?? 'compact',
          // The ONLY reconcile site: rows written before a widget existed hold
          // a short order, and the board renders only what is in it. Idempotent
          // and self-healing on every boot — don't add a second call site.
          widgetOrder: reconcileWidgetOrder(row.widget_order),
          hiddenWidgets: row.hidden_widgets ?? [],
          leadTimeOverrideMin: row.lead_time_override_min,
        },
        picks: {},
        customEvents: [],
        overrides: {},
      })
    }
    for (const p of picks) {
      const plan = map.get(p.event_id)
      if (plan) {
        plan.picks[p.performance_id] = {
          performanceId: p.performance_id,
          status: p.status,
          notifyOptIn: p.notify_opt_in,
        }
      }
    }
    for (const e of events) {
      map.get(e.event_id)?.customEvents.push({
        customEventId: e.custom_event_id,
        name: e.name,
        startMs: e.start_time,
        endMs: e.end_time,
      })
    }
    for (const o of overrides) {
      const plan = map.get(o.event_id)
      if (plan) {
        plan.overrides[o.performance_id] = {
          performanceId: o.performance_id,
          newStartMs: o.new_start_time,
          newEndMs: o.new_end_time,
          removed: o.removed,
        }
      }
    }
    plans.value = map
    hydrated.value = true
  }

  const plannedEventIds = computed(() => [...plans.value.keys()])

  function getPlan(eventId: string): PlanState | undefined {
    return plans.value.get(eventId)
  }

  function hasPlan(eventId: string): boolean {
    return plans.value.has(eventId)
  }

  function touch(): void {
    plans.value = new Map(plans.value)
  }

  /** Create an empty plan (start of onboarding). No-op if it exists. */
  function ensurePlan(eventId: string): PlanState {
    let plan = plans.value.get(eventId)
    if (!plan) {
      plan = {
        settings: {
          eventId,
          attendingDayIndexes: [],
          conflictDisplayPref: 'equal',
          backburnerNotifyDefault: false,
          timetableViewPref: 'compact',
          widgetOrder: [...DEFAULT_WIDGET_ORDER],
          hiddenWidgets: [],
          leadTimeOverrideMin: null,
        },
        picks: {},
        customEvents: [],
        overrides: {},
      }
      plans.value.set(eventId, plan)
      touch()
      const row = settingsToRow(plan.settings)
      persist(() => planRepo.put(row))
    }
    return plan
  }

  function updateSettings(eventId: string, patch: Partial<Omit<PlanSettings, 'eventId'>>): void {
    const plan = ensurePlan(eventId)
    Object.assign(plan.settings, patch)
    touch()
    const row = settingsToRow(plan.settings)
    persist(() => planRepo.put(row))
  }

  const selectDays = (eventId: string, days: number[]) =>
    updateSettings(eventId, { attendingDayIndexes: [...days].sort((a, b) => a - b) })
  const setConflictDisplayPref = (eventId: string, pref: ConflictDisplayPref) =>
    updateSettings(eventId, { conflictDisplayPref: pref })
  const setTimetableViewPref = (eventId: string, pref: TimetableViewPref) =>
    updateSettings(eventId, { timetableViewPref: pref })
  const setWidgetOrder = (eventId: string, order: WidgetId[]) =>
    updateSettings(eventId, { widgetOrder: order })
  const setHiddenWidgets = (eventId: string, hidden: WidgetId[]) =>
    updateSettings(eventId, { hiddenWidgets: hidden })
  const setLeadTimeOverride = (eventId: string, min: number | null) =>
    updateSettings(eventId, { leadTimeOverrideMin: min })

  /**
   * Backburner-notify default. Changing it re-applies to EXISTING backburner
   * picks (their C19/C23 buttons keep working for per-set overrides after).
   */
  function setBackburnerNotifyDefault(eventId: string, on: boolean): void {
    updateSettings(eventId, { backburnerNotifyDefault: on })
    const plan = plans.value.get(eventId)
    if (!plan) return
    const next = { ...plan.picks }
    for (const pick of Object.values(next)) {
      if (pick.status === 'backburner')
        next[pick.performanceId] = { ...pick, notifyOptIn: on }
    }
    setPicks(eventId, next)
  }

  /** Replace the whole pick map (domain transitions return new maps). */
  function setPicks(eventId: string, picks: PickMap): void {
    const plan = ensurePlan(eventId)
    plan.picks = picks
    touch()
    const rows = pickRows(eventId, picks)
    persist(() => picksRepo.replaceForEvent(eventId, rows))
  }

  function addCustomEvent(eventId: string, event: Omit<CustomEvent, 'customEventId'>): CustomEvent {
    const plan = ensurePlan(eventId)
    const full: CustomEvent = { ...event, customEventId: crypto.randomUUID() }
    plan.customEvents.push(full)
    plan.customEvents.sort((a, b) => a.startMs - b.startMs)
    touch()
    const row = eventToRow(eventId, full)
    persist(() => customEventsRepo.put(row))
    return full
  }

  function updateCustomEvent(eventId: string, event: CustomEvent): void {
    const plan = ensurePlan(eventId)
    const i = plan.customEvents.findIndex(e => e.customEventId === event.customEventId)
    if (i === -1) return
    plan.customEvents[i] = event
    plan.customEvents.sort((a, b) => a.startMs - b.startMs)
    touch()
    const row = eventToRow(eventId, event)
    persist(() => customEventsRepo.put(row))
  }

  function removeCustomEvent(eventId: string, customEventId: string): void {
    const plan = plans.value.get(eventId)
    if (!plan) return
    plan.customEvents = plan.customEvents.filter(e => e.customEventId !== customEventId)
    touch()
    persist(() => customEventsRepo.delete(customEventId))
  }

  function setOverride(eventId: string, override: PerformanceOverride): void {
    const plan = ensurePlan(eventId)
    plan.overrides[override.performanceId] = override
    touch()
    const row = overrideToRow(eventId, override)
    persist(() => overridesRepo.put(row))
  }

  function clearOverride(eventId: string, performanceId: string): void {
    const plan = plans.value.get(eventId)
    if (!plan) return
    delete plan.overrides[performanceId]
    touch()
    persist(() => overridesRepo.delete(eventId, performanceId))
  }

  /** C12 trigger: any local performance edits? */
  function hasLocalEdits(eventId: string): boolean {
    const plan = plans.value.get(eventId)
    return !!plan && Object.keys(plan.overrides).length > 0
  }

  /**
   * F-1 sync commit: atomically replace picks + wipe overrides + clamp days.
   * The domain sync logic computes the inputs; this only persists them.
   */
  function applySyncResult(eventId: string, picks: PickMap, attendingDayIndexes: number[]): void {
    const plan = ensurePlan(eventId)
    plan.picks = picks
    plan.overrides = {}
    plan.settings.attendingDayIndexes = attendingDayIndexes
    touch()
    const db = getDB()
    const rows = pickRows(eventId, picks)
    const settingsRow = settingsToRow(plan.settings)
    persist(() => db.transaction(
      'rw',
      [db.local_plans, db.local_picks, db.local_performance_overrides],
      async () => {
        await db.local_plans.put(settingsRow)
        await db.local_picks.where('event_id').equals(eventId).delete()
        await db.local_picks.bulkPut(rows)
        await db.local_performance_overrides.where('event_id').equals(eventId).delete()
      },
    ))
  }

  /** S-5: wipe the whole plan (concert cache row handled by caller). */
  function cancelPlan(eventId: string): void {
    plans.value.delete(eventId)
    touch()
    const db = getDB()
    persist(() => db.transaction(
      'rw',
      [db.local_plans, db.local_picks, db.local_custom_events, db.local_performance_overrides],
      async () => {
        await planRepo.delete(eventId)
        await picksRepo.deleteForEvent(eventId)
        await customEventsRepo.deleteForEvent(eventId)
        await overridesRepo.deleteForEvent(eventId)
      },
    ))
  }

  return {
    plans,
    hydrated,
    plannedEventIds,
    hydrate,
    getPlan,
    hasPlan,
    ensurePlan,
    selectDays,
    setConflictDisplayPref,
    setBackburnerNotifyDefault,
    setTimetableViewPref,
    setWidgetOrder,
    setHiddenWidgets,
    setLeadTimeOverride,
    setPicks,
    addCustomEvent,
    updateCustomEvent,
    removeCustomEvent,
    setOverride,
    clearOverride,
    hasLocalEdits,
    applySyncResult,
    cancelPlan,
  }
})
