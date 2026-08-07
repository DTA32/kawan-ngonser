<script setup lang="ts">
/**
 * W-2 detailed timetable — the minute-proportional day canvas. All geometry
 * comes from utils/timetable-detailed; this component only paints it and
 * owns the scroll behaviour (auto-scroll to now, jump-back pill).
 */
import { formatTime } from '~/domain/time'
import type { Concert } from '~/domain/types'
import { DESIGN_COPY } from '~/utils/copy'
import { type DetailedBlock, buildDetailedModel, timeAtOffset } from '~/utils/timetable-detailed'

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

const stageOf = computed(() => new Map(props.concert.stages.map(s => [s.stageId, s])))

const model = computed(() => buildDetailedModel({
  entries: plan.schedule.value?.byDay.get(props.dayIndex) ?? [],
  picks: plan.picks.value,
  pref: plan.settings.value?.conflictDisplayPref ?? 'equal',
  nowMs: now.value,
  mode: props.mode,
  dayWindow: plan.schedule.value?.dayWindows.get(props.dayIndex),
}))

/** Gutter width matches the compact view's hour column. */
const GUTTER_PX = 38
/** Keep the now-line a little below the top edge when we scroll to it. */
const NOW_LEAD_PX = 80

const scroller = ref<HTMLElement | null>(null)
const nowOffscreen = ref(false)

function scrollToNow(smooth = false) {
  const el = scroller.value
  const target = model.value.nowTop ?? model.value.blocks[0]?.top
  if (!el || target === undefined) return
  el.scrollTo({ top: Math.max(0, target - NOW_LEAD_PX), behavior: smooth ? 'smooth' : 'auto' })
}

function onScroll() {
  const el = scroller.value
  const nowTop = model.value.nowTop
  if (!el || nowTop === null) {
    nowOffscreen.value = false
    return
  }
  nowOffscreen.value = nowTop < el.scrollTop || nowTop > el.scrollTop + el.clientHeight
}

onMounted(() => {
  scrollToNow()
  onScroll()
})

/** Tapping bare canvas drops a custom event at that time (the gap-slot analogue). */
function onCanvasClick(e: MouseEvent) {
  if (e.target !== e.currentTarget) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  emit('addEvent', timeAtOffset(model.value, e.clientY - rect.top))
}

function onBlockSelect(block: DetailedBlock) {
  if (block.entry.kind === 'performance')
    emit('selectPerformance', block.entry.performance.performanceId)
  else
    emit('selectCustom', block.entry.event.customEventId)
}

function blockStyle(block: DetailedBlock) {
  return {
    top: `${block.top}px`,
    height: `${block.height}px`,
    left: `${block.left * 100}%`,
    width: `${block.width * 100}%`,
  }
}
</script>

<template>
  <div class="relative">
    <div
      ref="scroller"
      class="relative max-h-[340px] overflow-y-auto overscroll-contain pb-2.5"
      @scroll="onScroll"
    >
      <div class="relative" :style="{ height: `${model.height}px` }">
        <!-- hour axis -->
        <div
          v-for="hour in model.hours"
          :key="hour.labelMs"
          class="pointer-events-none absolute inset-x-0"
          :style="{ top: `${hour.top}px` }"
        >
          <span
            v-if="!hour.suppressed"
            class="absolute -top-1.5 left-0 text-[11px] text-text-muted"
          >{{ formatTime(hour.labelMs, concert.timezone) }}</span>
          <span
            class="absolute right-0 h-px bg-border"
            :style="{ left: `${GUTTER_PX}px` }"
          />
        </div>

        <!-- tap-to-add surface, behind the blocks -->
        <div
          class="absolute inset-y-0 right-0"
          :style="{ left: `${GUTTER_PX}px` }"
          @click="onCanvasClick"
        />

        <!-- lane-packed blocks -->
        <div class="absolute inset-y-0 right-0" :style="{ left: `${GUTTER_PX}px` }">
          <div
            v-for="(block, bi) in model.blocks"
            :key="bi"
            class="absolute pr-1"
            :style="blockStyle(block)"
          >
            <ConcertDayTimetableEntry
              v-if="block.entry.kind === 'performance'"
              :performance="block.entry.performance"
              :stage="stageOf.get(block.entry.performance.stageId)"
              :timezone="concert.timezone"
              :backburner="block.role === 'backburner'"
              :past="block.past"
              variant="block"
              :density="block.density"
              @select="onBlockSelect(block)"
            />
            <ConcertDayTimetableCustomEventEntry
              v-else
              :event="block.entry.event"
              :timezone="concert.timezone"
              :past="block.past"
              variant="block"
              :density="block.density"
              @select="onBlockSelect(block)"
            />
          </div>
        </div>

        <!-- now line, above everything it crosses -->
        <div
          v-if="model.nowTop !== null"
          class="pointer-events-none absolute inset-x-0 flex items-center gap-1"
          :style="{ top: `${model.nowTop - 6}px` }"
        >
          <span class="w-[30px] shrink-0 text-[11px] font-bold text-primary">
            {{ formatTime(now, concert.timezone) }}
          </span>
          <span class="size-2 shrink-0 rounded-full bg-primary" />
          <span class="-ml-1 h-0.5 flex-1 rounded-[1px] bg-primary" />
        </div>
      </div>
    </div>

    <!-- jump back to now once it has scrolled away -->
    <button
      v-if="nowOffscreen"
      type="button"
      class="absolute inset-x-0 bottom-2 mx-auto flex w-fit items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 shadow-lg"
      @click="scrollToNow(true)"
    >
      <UIcon name="i-lucide-crosshair" class="size-3.5 text-white" />
      <span class="text-[11px] font-semibold text-white">{{ DESIGN_COPY.jumpToNow }}</span>
    </button>
  </div>
</template>
