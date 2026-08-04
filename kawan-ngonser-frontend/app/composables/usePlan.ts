/**
 * The facade components consume for one concert's plan. Wraps the plan store
 * (state + persistence) and the pure pick state machine (domain/picks) —
 * transitions return effects the caller turns into C29 toasts / O-4 prompts.
 */
import * as picksDomain from '~/domain/picks'
import type { PickEffect } from '~/domain/picks'
import { makeRemoval, makeTimeOverride } from '~/domain/overrides'
import { detectUnresolvedConflicts } from '~/domain/conflicts'
import type { ConflictPrompt, CustomEvent } from '~/domain/types'
import { usePlanStore } from '~/stores/plan'

export function usePlan(eventId: MaybeRefOrGetter<string>) {
  const store = usePlanStore()
  const schedule = useEffectiveSchedule(eventId)

  const id = () => toValue(eventId)
  const plan = computed(() => store.getPlan(id()))
  const performances = () => schedule.value?.performances ?? []

  return {
    plan,
    schedule,
    exists: computed(() => store.hasPlan(id())),
    settings: computed(() => plan.value?.settings),
    picks: computed(() => plan.value?.picks ?? {}),
    customEvents: computed(() => plan.value?.customEvents ?? []),
    overrides: computed(() => plan.value?.overrides ?? {}),
    hasLocalEdits: computed(() => store.hasLocalEdits(id())),

    // -- onboarding / settings -------------------------------------------
    ensurePlan: () => store.ensurePlan(id()),
    selectDays: (days: number[]) => store.selectDays(id(), days),
    setConflictDisplayPref: (pref: 'equal' | 'hidden') => store.setConflictDisplayPref(id(), pref),
    setBackburnerNotifyDefault: (on: boolean) => store.setBackburnerNotifyDefault(id(), on),
    setWidgetOrder: (order: Parameters<typeof store.setWidgetOrder>[1]) => store.setWidgetOrder(id(), order),
    setLeadTimeOverride: (min: number | null) => store.setLeadTimeOverride(id(), min),
    cancelPlan: () => store.cancelPlan(id()),

    /** O-3 checkbox toggle: no conflict prompt yet — O-4 runs on proceed. */
    togglePick(performanceId: string): void {
      const current = plan.value?.picks ?? {}
      if (current[performanceId] && current[performanceId].status !== 'skipped') {
        const next = { ...current }
        delete next[performanceId]
        store.setPicks(id(), next)
      }
      else {
        store.setPicks(id(), {
          ...current,
          [performanceId]: { performanceId, status: 'preferred', notifyOptIn: false },
        })
      }
    },

    /** Unresolved O-4 prompts over the current picks (per day on proceed). */
    pendingConflicts(dayIndex?: number): ConflictPrompt[] {
      const prompts = detectUnresolvedConflicts(plan.value?.picks ?? {}, performances())
      return dayIndex === undefined ? prompts : prompts.filter(p => p.dayIndex === dayIndex)
    },

    // -- pick transitions (effects → C29 toasts / conflict sheets) --------
    resolveConflict(groupIds: string[], winnerId: string): PickEffect[] {
      const r = picksDomain.resolveConflict(
        plan.value?.picks ?? {},
        groupIds,
        winnerId,
        plan.value?.settings.backburnerNotifyDefault ?? false,
      )
      store.setPicks(id(), r.picks)
      return r.effects
    },
    addPick(performanceId: string): PickEffect[] {
      const r = picksDomain.addPick(plan.value?.picks ?? {}, performances(), performanceId)
      store.setPicks(id(), r.picks)
      return r.effects
    },
    skip(performanceId: string): PickEffect[] {
      const r = picksDomain.skipPick(plan.value?.picks ?? {}, performances(), performanceId)
      store.setPicks(id(), r.picks)
      return r.effects
    },
    swapPreferred(performanceId: string): { effects: PickEffect[], demoted: string[] } {
      const r = picksDomain.swapPreferred(
        plan.value?.picks ?? {},
        performances(),
        performanceId,
        plan.value?.settings.backburnerNotifyDefault ?? false,
      )
      store.setPicks(id(), r.picks)
      return { effects: r.effects, demoted: r.demoted }
    },
    setNotifyOptIn(performanceId: string, on: boolean): void {
      const r = picksDomain.setNotifyOptIn(plan.value?.picks ?? {}, performanceId, on)
      store.setPicks(id(), r.picks)
    },

    // -- W-2 edit affordance ---------------------------------------------
    overrideTime(performanceId: string, startMs: number, endMs: number): void {
      store.setOverride(id(), makeTimeOverride(performanceId, startMs, endMs))
    },
    /** Remove a set (performer cancelled) — drops the pick + promotes. */
    removePerformance(performanceId: string): PickEffect[] {
      store.setOverride(id(), makeRemoval(performanceId))
      // schedule computed refreshes synchronously after the override lands
      const r = picksDomain.removePick(plan.value?.picks ?? {}, performances(), performanceId)
      store.setPicks(id(), r.picks)
      return r.effects
    },

    // -- custom events ----------------------------------------------------
    addCustomEvent: (e: Omit<CustomEvent, 'customEventId'>) => store.addCustomEvent(id(), e),
    updateCustomEvent: (e: CustomEvent) => store.updateCustomEvent(id(), e),
    removeCustomEvent: (customEventId: string) => store.removeCustomEvent(id(), customEventId),
  }
}
