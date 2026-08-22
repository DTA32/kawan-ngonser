<script setup lang="ts">
/**
 * B-8 add/edit a set. The one rule worth reading: an end time at or before the
 * start is a PAST-MIDNIGHT SPILL, not a validation error — the set keeps its
 * dayIndex and the end lands on the next date (§3.1). The sheet says so rather
 * than rejecting the input.
 */
import {
  type BuildPerformance,
  type ConcertBuild,
  resolveSetTimes,
  timeOfIso,
} from '~/domain/builds'
import { DESIGN_COPY, interpolate } from '~/utils/copy'
import { useBuildsStore } from '~/stores/builds'

const props = defineProps<{
  build: ConcertBuild
  /** null = add mode */
  performance: BuildPerformance | null
  /** Day to file a NEW set under */
  defaultDayIndex: number
}>()

const open = defineModel<boolean>('open', { required: true })

const builds = useBuildsStore()

const artistName = ref('')
const artistImage = ref('')
const dayIndex = ref(props.defaultDayIndex)
const stageId = ref('')
const startHHmm = ref('19:00')
const endHHmm = ref('20:00')

// Re-seed on every open so the sheet never shows the previous set's values.
watch(open, (isOpen) => {
  if (!isOpen) return
  const p = props.performance
  artistName.value = p?.artistName ?? ''
  artistImage.value = p?.artistImage ?? ''
  dayIndex.value = p?.dayIndex ?? props.defaultDayIndex
  stageId.value = p?.stageId ?? props.build.stages[0]?.stageId ?? ''
  startHHmm.value = p ? timeOfIso(p.start) : '19:00'
  endHHmm.value = p ? timeOfIso(p.end) : '20:00'
}, { immediate: true })

const spills = computed(() => endHHmm.value <= startHHmm.value)
const dayDate = computed(() => props.build.days.find(d => d.dayIndex === dayIndex.value)?.date ?? '')
const canSave = computed(() => artistName.value.trim().length > 0 && stageId.value !== '' && dayDate.value !== '')

function save() {
  const { start, end } = resolveSetTimes(dayDate.value, startHHmm.value, endHHmm.value)
  const fields = {
    artistName: artistName.value.trim(),
    artistImage: artistImage.value.trim(),
    dayIndex: dayIndex.value,
    stageId: stageId.value,
    start,
    end,
  }
  if (props.performance) builds.updatePerformance(props.build.buildId, props.performance.performanceId, fields, nowMs())
  else builds.addPerformance(props.build.buildId, fields, nowMs())
  open.value = false
}

function remove() {
  if (props.performance) builds.removePerformance(props.build.buildId, props.performance.performanceId, nowMs())
  open.value = false
}

const inputClass = 'min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-text outline-none placeholder:font-normal placeholder:text-text-muted'
const selectClass = `${inputClass} appearance-none`
</script>

<template>
  <CommonBottomSheet v-model:open="open">
    <div class="flex flex-col gap-1.5">
      <h2 class="font-heading text-[19px] font-bold text-text">
        {{ performance ? DESIGN_COPY.setSheetEditTitle : DESIGN_COPY.setSheetAddTitle }}
      </h2>
      <p class="text-[13px] text-text-secondary">{{ build.name || DESIGN_COPY.builderNewTitle }}</p>
    </div>

    <div class="flex flex-col gap-3.5">
      <BuilderField :label="DESIGN_COPY.fieldArtist" icon="i-lucide-mic-vocal">
        <input v-model="artistName" :class="inputClass" placeholder="Pamungkas">
      </BuilderField>

      <BuilderField :label="DESIGN_COPY.fieldArtistImage" icon="i-lucide-link">
        <input v-model="artistImage" :class="inputClass" :placeholder="DESIGN_COPY.fieldOptional">
      </BuilderField>

      <div class="flex gap-2.5">
        <BuilderField :label="DESIGN_COPY.fieldDay" icon="i-lucide-calendar-days" class="flex-1">
          <select v-model.number="dayIndex" :class="selectClass">
            <option v-for="d in build.days" :key="d.dayIndex" :value="d.dayIndex">Day {{ d.dayIndex }}</option>
          </select>
        </BuilderField>
        <BuilderField :label="DESIGN_COPY.fieldStage" icon="i-lucide-map-pin" class="flex-1">
          <select v-model="stageId" :class="selectClass">
            <option v-for="s in build.stages" :key="s.stageId" :value="s.stageId">{{ s.name }}</option>
          </select>
        </BuilderField>
      </div>

      <div class="flex gap-2.5">
        <BuilderField :label="DESIGN_COPY.fieldStarts" icon="i-lucide-clock-4" class="flex-1">
          <input v-model="startHHmm" type="time" :class="inputClass">
        </BuilderField>
        <BuilderField :label="DESIGN_COPY.fieldEnds" icon="i-lucide-clock-4" class="flex-1">
          <input v-model="endHHmm" type="time" :class="inputClass">
        </BuilderField>
      </div>
    </div>

    <div v-if="spills" class="flex items-start gap-2.5 rounded-xl bg-info/[0.08] px-3 py-2.5">
      <UIcon name="i-lucide-moon" class="mt-px size-4 shrink-0 text-info" />
      <p class="text-xs leading-relaxed text-text-secondary">
        {{ interpolate(DESIGN_COPY.midnightNote, { x: dayIndex }) }}
      </p>
    </div>

    <button
      type="button"
      class="w-full rounded-[28px] bg-primary px-6 py-3.5 text-[15px] font-semibold text-on-primary active:bg-primary-pressed disabled:opacity-50"
      :disabled="!canSave"
      @click="save"
    >
      {{ performance ? DESIGN_COPY.saveSetConfirm : DESIGN_COPY.addSetConfirm }}
    </button>

    <button
      v-if="performance"
      type="button"
      class="flex w-full items-center justify-center gap-2 px-6 py-3 text-[15px] font-semibold text-danger"
      @click="remove"
    >
      <UIcon name="i-lucide-trash-2" class="size-4" />
      {{ DESIGN_COPY.removeSetCta }}
    </button>
  </CommonBottomSheet>
</template>
