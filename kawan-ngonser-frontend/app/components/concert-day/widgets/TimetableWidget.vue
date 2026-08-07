<script setup lang="ts">
/**
 * W-2 timetable, in two renderings the user picks between (persisted per
 * concert as `timetableViewPref`):
 *  - compact  — cluster rows from utils/timetable: past collapse, now marker,
 *               hour-labeled slots with equal-split conflict columns, gap
 *               slots (+ custom events), forward-window expand, add-a-break.
 *  - detailed — the minute-proportional canvas in TimetableDetailed.
 */
import { formatTime } from '~/domain/time'
import type { Concert, TimetableViewPref } from '~/domain/types'
import { DESIGN_COPY, interpolate } from '~/utils/copy'
import { buildTimetableModel, type SlotNode } from '~/utils/timetable'

const props = defineProps<{
  concert: Concert
  dayIndex: number
  mode: 'today' | 'preview'
}>()

const emit = defineEmits<{
  selectPerformance: [performanceId: string]
  selectCustom: [customEventId: string]
  addEvent: [prefillMs: number]
}>()

const plan = usePlan(() => props.concert.eventId)
const now = useNow()

const pastExpanded = ref(false)
const laterExpanded = ref(false)

const stageOf = computed(() => new Map(props.concert.stages.map(s => [s.stageId, s])))

const model = computed(() => buildTimetableModel({
  entries: plan.schedule.value?.byDay.get(props.dayIndex) ?? [],
  picks: plan.picks.value,
  pref: plan.settings.value?.conflictDisplayPref ?? 'equal',
  nowMs: now.value,
  mode: props.mode,
}))

const view = computed(() => plan.settings.value?.timetableViewPref ?? 'compact')

const VIEWS: { value: TimetableViewPref, icon: string, label: string }[] = [
  { value: 'compact', icon: 'i-lucide-list', label: DESIGN_COPY.timetableViewCompact },
  { value: 'detailed', icon: 'i-lucide-calendar-days', label: DESIGN_COPY.timetableViewDetailed },
]

const dayDone = computed(() =>
  props.mode === 'today'
  && model.value.visible.length === 0
  && model.value.later.length === 0)

function onEntrySelect(col: SlotNode['rows'][number][number]) {
  if (col.entry.kind === 'performance')
    emit('selectPerformance', col.entry.performance.performanceId)
  else
    emit('selectCustom', col.entry.event.customEventId)
}
</script>

<template>
  <CommonWidgetCard>
    <template #title>{{ DESIGN_COPY.widgetTimetable }}</template>

    <!-- compact / detailed switch -->
    <template #header-extra>
      <div class="flex items-center gap-0.5 rounded-[9px] bg-surface-raised p-0.5" role="radiogroup" aria-label="Timetable view">
        <button
          v-for="v in VIEWS"
          :key="v.value"
          type="button"
          role="radio"
          :aria-checked="view === v.value"
          :aria-label="v.label"
          class="rounded-[7px] px-2 py-1"
          :class="view === v.value ? 'bg-primary/15' : ''"
          @click="plan.setTimetableViewPref(v.value)"
        >
          <UIcon :name="v.icon" class="size-3.5" :class="view === v.value ? 'text-primary' : 'text-text-muted'" />
        </button>
      </div>
    </template>

    <ConcertDayTimetableDetailed
      v-if="view === 'detailed'"
      :concert="concert"
      :day-index="dayIndex"
      :mode="mode"
      @select-performance="emit('selectPerformance', $event)"
      @select-custom="emit('selectCustom', $event)"
      @add-event="emit('addEvent', $event)"
    />

    <!-- past collapse (today only) -->
    <template v-if="view === 'compact' && mode === 'today' && model.past.length > 0">
      <button
        type="button"
        class="flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-bg px-2.5 py-2"
        @click="pastExpanded = !pastExpanded"
      >
        <UIcon :name="pastExpanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" class="size-3.5 text-text-muted" />
        <span class="text-xs text-text-muted">
          {{ interpolate(DESIGN_COPY.pastCollapse, { n: model.pastSetCount }) }}
        </span>
      </button>

      <template v-if="pastExpanded">
        <div v-for="slot in model.past" :key="slot.labelMs" class="flex gap-2.5">
          <div class="w-[38px] shrink-0 pt-2.5">
            <span class="text-[11px] text-text-muted">{{ formatTime(slot.labelMs, concert.timezone) }}</span>
          </div>
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <div v-for="(row, ri) in slot.rows" :key="ri" class="flex items-stretch gap-1">
              <template v-for="col in row" :key="col.entry.startMs + col.role">
                <ConcertDayTimetableEntry
                  v-if="col.entry.kind === 'performance'"
                  :performance="col.entry.performance"
                  :stage="stageOf.get(col.entry.performance.stageId)"
                  :timezone="concert.timezone"
                  :backburner="col.role === 'backburner'"
                  past
                  @select="onEntrySelect(col)"
                />
                <ConcertDayTimetableCustomEventEntry
                  v-else
                  :event="col.entry.event"
                  :timezone="concert.timezone"
                  past
                  @select="onEntrySelect(col)"
                />
              </template>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- now marker (today only) -->
    <div v-if="view === 'compact' && mode === 'today'" class="flex items-center gap-2">
      <span class="text-[11px] font-bold text-primary">{{ formatTime(now, concert.timezone) }}</span>
      <span class="h-0.5 flex-1 rounded-[1px] bg-primary" />
    </div>

    <!-- upcoming slots -->
    <template v-for="(node, ni) in view === 'compact' ? (laterExpanded ? [...model.visible, ...model.later] : model.visible) : []" :key="ni">
      <button
        v-if="node.type === 'gap'"
        type="button"
        class="flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 ring-1 ring-inset ring-border"
        @click="emit('addEvent', node.prefillMs)"
      >
        <UIcon name="i-lucide-plus" class="size-3 text-text-muted" />
        <span class="text-[11px] text-text-muted">{{ DESIGN_COPY.emptySlot }}</span>
      </button>

      <div v-else class="flex gap-2.5">
        <div class="w-[38px] shrink-0 pt-2.5">
          <span class="text-[11px] text-text-muted">{{ formatTime(node.labelMs, concert.timezone) }}</span>
        </div>
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <div v-for="(row, ri) in node.rows" :key="ri" class="flex items-stretch gap-1">
            <template v-for="col in row" :key="col.entry.startMs + col.role">
              <ConcertDayTimetableEntry
                v-if="col.entry.kind === 'performance'"
                :performance="col.entry.performance"
                :stage="stageOf.get(col.entry.performance.stageId)"
                :timezone="concert.timezone"
                :backburner="col.role === 'backburner'"
                @select="onEntrySelect(col)"
              />
              <ConcertDayTimetableCustomEventEntry
                v-else
                :event="col.entry.event"
                :timezone="concert.timezone"
                @select="onEntrySelect(col)"
              />
            </template>
          </div>
        </div>
      </div>
    </template>

    <!-- day-done: everything played, still allow adding a late event -->
    <button
      v-if="dayDone"
      type="button"
      class="flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 ring-1 ring-inset ring-border"
      @click="emit('addEvent', now)"
    >
      <UIcon name="i-lucide-plus" class="size-3 text-text-muted" />
      <span class="text-[11px] text-text-muted">{{ DESIGN_COPY.emptySlot }}</span>
    </button>

    <!-- add a break -->
    <button
      v-if="!dayDone"
      type="button"
      class="flex w-full items-center justify-center gap-1.5 rounded-[10px] px-2.5 py-[9px] ring-1 ring-inset ring-border"
      @click="emit('addEvent', now + 15 * 60_000)"
    >
      <UIcon name="i-lucide-plus" class="size-3.5 text-text-muted" />
      <span class="text-xs text-text-muted">{{ DESIGN_COPY.addBreak }}</span>
    </button>

    <!-- expand to end of day (compact only — detailed shows the whole day) -->
    <button
      v-if="view === 'compact' && model.later.length > 0"
      type="button"
      class="flex w-full items-center justify-center gap-1.5 py-1"
      @click="laterExpanded = !laterExpanded"
    >
      <span class="text-xs font-semibold text-primary">
        {{ laterExpanded ? 'Show less' : DESIGN_COPY.expandToEndOfDay }}
      </span>
      <UIcon :name="laterExpanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-3.5 text-primary" />
    </button>
  </CommonWidgetCard>
</template>
