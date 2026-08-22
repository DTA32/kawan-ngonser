<script setup lang="ts">
/**
 * B-7 sets, grouped by day and stage-coloured like the timetable.
 *
 * The judgement call worth knowing: CROSS-stage overlaps are never flagged —
 * they are exactly the clashes the rest of the app exists to resolve, so
 * warning about them would fight the product. A SAME-stage overlap is a data
 * error (one stage, two acts, same minute) and is called out on both rows.
 *
 * Also hosts the B-10 readiness gate and the B-12 / B-13 actions.
 */
import {
  type BuildPerformance,
  type ConcertBuild,
  clashingPerformanceIds,
  performancesOfDay,
  readiness,
  sameStageClashes,
  spillsPastMidnight,
  stageOf,
  timeOfIso,
} from '~/domain/builds'
import { formatDayLabel } from '~/domain/time'
import { stageStyleVars } from '~/utils/stage-color'
import { COPY, DESIGN_COPY, interpolate } from '~/utils/copy'

const props = defineProps<{ build: ConcertBuild }>()

const emit = defineEmits<{
  add: [dayIndex: number]
  edit: [BuildPerformance]
  plan: []
  export: []
}>()

const state = computed(() => readiness(props.build))
const clashing = computed(() => clashingPerformanceIds(props.build))

const clashNotices = computed(() =>
  sameStageClashes(props.build).map(c => ({
    stageId: c.stageId,
    text: interpolate(COPY.toastStageClash, { stage: stageOf(props.build, c.stageId)?.name ?? c.stageId }),
  })))

const days = computed(() => props.build.days.map(d => ({
  ...d,
  label: `Day ${d.dayIndex} · ${formatDayLabel(d.date, props.build.timezone)}`,
  sets: performancesOfDay(props.build, d.dayIndex).map(p => ({
    perf: p,
    stage: stageOf(props.build, p.stageId),
    time: `${timeOfIso(p.start)} – ${timeOfIso(p.end)}`,
    spills: spillsPastMidnight(p),
    clashes: clashing.value.has(p.performanceId),
  })),
})))

const counts = computed(() => {
  const n = props.build.performances.length
  const d = props.build.days.length
  const s = props.build.stages.length
  return {
    sets: n === 1 ? '1 set' : `${n} sets`,
    days: d === 1 ? '1 day' : `${d} days`,
    stages: s === 1 ? '1 stage' : `${s} stages`,
  }
})

const GAP_COPY: Record<string, string> = {
  name: COPY.gapName,
  timezone: COPY.gapTimezone,
  days: COPY.gapDays,
  stages: COPY.gapStages,
  performances: COPY.gapPerformances,
}

const checklist = computed(() => state.value.gaps.map(g =>
  g === 'incompleteSets'
    ? interpolate(COPY.gapIncompleteSets, { n: state.value.incompleteCount })
    : GAP_COPY[g] ?? g))

function varsFor(color: string | undefined) {
  return stageStyleVars(color ?? '')
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-col gap-2">
      <h1 class="font-heading text-2xl font-bold leading-tight text-text">{{ COPY.stepPerformances }}</h1>
      <p class="text-sm leading-relaxed text-text-secondary">
        {{ interpolate(DESIGN_COPY.performancesSub, { n: counts.sets, d: counts.days }) }}
      </p>
    </div>

    <CommonEmptyState
      v-if="build.days.length === 0"
      card
      icon="i-lucide-calendar-plus"
      :main="DESIGN_COPY.noDaysYet"
    />
    <CommonEmptyState
      v-else-if="build.stages.length === 0"
      card
      icon="i-lucide-map-pin"
      :main="DESIGN_COPY.noStagesYet"
    />

    <section v-for="day in days" v-else :key="day.dayIndex" class="flex flex-col gap-2.5">
      <CommonSectionLabel>{{ day.label }}</CommonSectionLabel>

      <button
        v-for="s in day.sets"
        :key="s.perf.performanceId"
        type="button"
        class="flex w-full items-center gap-3 rounded-2xl bg-surface p-3.5 text-left ring-inset"
        :class="s.clashes ? 'ring-1 ring-warning/40' : 'ring-0'"
        @click="emit('edit', s.perf)"
      >
        <span
          class="h-10 w-1 shrink-0 rounded-sm"
          :style="{ background: varsFor(s.stage?.color)['--stage'] }"
        />
        <span class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="truncate text-[15px] font-semibold text-text">
            {{ s.perf.artistName || 'Untitled set' }}
          </span>
          <span class="flex items-center gap-1.5 text-[13px] text-text-secondary">
            {{ s.time }}
            <UIcon v-if="s.spills" name="i-lucide-moon" class="size-3.5 shrink-0 text-info" />
          </span>
        </span>
        <span
          class="shrink-0 rounded-full px-2.5 py-[5px] text-xs font-semibold"
          :style="{
            background: varsFor(s.stage?.color)['--stage-chip'],
            color: varsFor(s.stage?.color)['--stage'],
          }"
        >{{ s.stage?.name ?? '—' }}</span>
      </button>

      <div
        v-for="notice in clashNotices.filter(n => day.sets.some(s => s.perf.stageId === n.stageId && s.clashes))"
        :key="notice.stageId"
        class="flex items-start gap-2.5 rounded-xl bg-warning/10 px-3 py-2.5 ring-1 ring-inset ring-warning/25"
      >
        <UIcon name="i-lucide-triangle-alert" class="mt-px size-4 shrink-0 text-warning" />
        <p class="text-xs leading-relaxed text-text-secondary">{{ notice.text }}</p>
      </div>

      <BuilderAddRow :label="DESIGN_COPY.addSetCta" @click="emit('add', day.dayIndex)" />
    </section>

    <!-- B-10 -->
    <div
      v-if="state.ready"
      class="flex items-center gap-3 rounded-2xl bg-success/10 p-3.5 ring-1 ring-inset ring-success/20"
    >
      <UIcon name="i-lucide-circle-check" class="size-5 shrink-0 text-success" />
      <span class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="text-sm font-semibold text-text">{{ DESIGN_COPY.readyTitle }}</span>
        <span class="text-xs text-text-secondary">
          {{ interpolate(DESIGN_COPY.readySub, { d: counts.days, s: counts.stages, n: counts.sets }) }}
        </span>
      </span>
    </div>
    <div v-else class="flex flex-col gap-3 rounded-2xl bg-surface p-3.5">
      <div class="flex items-center gap-2.5">
        <UIcon name="i-lucide-list-checks" class="size-[18px] shrink-0 text-warning" />
        <span class="flex-1 text-sm font-semibold text-text">
          {{ interpolate(COPY.readinessTitle, { n: state.gaps.length }) }}
        </span>
      </div>
      <ul class="flex flex-col gap-2.5">
        <li v-for="item in checklist" :key="item" class="flex items-center gap-2.5">
          <UIcon name="i-lucide-circle" class="size-[15px] shrink-0 text-text-muted" />
          <span class="text-[13px] font-semibold text-text">{{ item }}</span>
        </li>
      </ul>
    </div>

    <!-- B-12 / B-13 -->
    <div class="flex flex-col gap-2.5">
      <button
        type="button"
        class="w-full rounded-[28px] bg-primary px-6 py-3.5 text-[15px] font-semibold text-on-primary active:bg-primary-pressed disabled:opacity-40"
        :disabled="!state.ready"
        @click="emit('plan')"
      >
        {{ COPY.planBuildCta }}
      </button>
      <button
        type="button"
        class="w-full rounded-[28px] bg-surface px-6 py-3.5 text-[15px] font-semibold text-text ring-1 ring-inset ring-border disabled:opacity-40"
        :disabled="!state.ready"
        @click="emit('export')"
      >
        Export JSON
      </button>
      <p class="text-xs leading-relaxed text-text-muted">{{ DESIGN_COPY.buildActionsNote }}</p>
    </div>
  </div>
</template>
