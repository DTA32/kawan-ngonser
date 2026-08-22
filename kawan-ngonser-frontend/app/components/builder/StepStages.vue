<script setup lang="ts">
/**
 * B-6 stages. Selecting a row opens the colour editor below the list (design
 * frame "Builder – Stages"): swatches, a free hex field, and a live preview
 * that shows the §12.4 CLAMPED result — so an unreadable pick is visibly
 * corrected before it ever reaches a timetable.
 */
import { type ConcertBuild, countSetsOnStage } from '~/domain/builds'
import { clampStageColor, stageStyleVars } from '~/utils/stage-color'
import { COPY, DESIGN_COPY, interpolate } from '~/utils/copy'
import { useBuildsStore } from '~/stores/builds'

const props = defineProps<{ build: ConcertBuild }>()

const builds = useBuildsStore()

const SWATCHES = ['#E85D75', '#F2A93B', '#2FBF9B', '#4CC3FF', '#7C5CFF', '#C94FD6', '#E8E85D']

const selectedId = ref<string | null>(props.build.stages[0]?.stageId ?? null)
const selected = computed(() => props.build.stages.find(s => s.stageId === selectedId.value) ?? null)

const rows = computed(() => props.build.stages.map(s => ({
  ...s,
  setCount: countSetsOnStage(props.build, s.stageId),
})))

function addStage() {
  const n = props.build.stages.length + 1
  const color = SWATCHES[props.build.stages.length % SWATCHES.length]!
  selectedId.value = builds.addStage(props.build.buildId, `Stage ${n}`, color, nowMs())
}

// stageId stays put on rename: performances reference it, and re-slugging
// would orphan every set already assigned to this stage.
const nameDraft = ref('')
watch(selected, s => { nameDraft.value = s?.name ?? '' }, { immediate: true })

function flushName() {
  const s = selected.value
  if (s && nameDraft.value !== s.name) {
    builds.updateStage(props.build.buildId, s.stageId, { name: nameDraft.value }, nowMs())
  }
}
watchDebounced(nameDraft, flushName, { debounce: 400 })
onBeforeUnmount(flushName)

function recolor(stageId: string, color: string) {
  builds.updateStage(props.build.buildId, stageId, { color }, nowMs())
}

const hexDraft = ref('')
watch(selected, (s) => { hexDraft.value = (s?.color ?? '').replace(/^#/, '') }, { immediate: true })

function commitHex() {
  if (!selected.value) return
  const value = hexDraft.value.trim().replace(/^#/, '')
  if (/^[0-9a-f]{6}$/i.test(value)) recolor(selected.value.stageId, `#${value.toUpperCase()}`)
  else hexDraft.value = selected.value.color.replace(/^#/, '')
}

const previewVars = computed(() => stageStyleVars(selected.value?.color ?? ''))

// -- removal (B-6) ---------------------------------------------------------
const pending = ref<{ stageId: string, name: string, setCount: number } | null>(null)
const confirmOpen = ref(false)

/** Where orphaned sets go: the first other stage, or nowhere if none exists. */
const reassignTarget = computed(() =>
  props.build.stages.find(s => s.stageId !== pending.value?.stageId) ?? null)

function askRemove(row: { stageId: string, name: string, setCount: number }) {
  pending.value = row
  confirmOpen.value = true
}

function confirmRemove() {
  const row = pending.value
  if (!row) return
  const target = reassignTarget.value
  builds.removeStage(props.build.buildId, row.stageId, nowMs(), target?.stageId)
  if (row.setCount > 0 && target) {
    useToast().add({
      description: interpolate(COPY.toastStageRemoved, { stage: row.name, n: row.setCount, other: target.name }),
      icon: 'i-lucide-circle-check',
      color: 'success',
    })
  }
  if (selectedId.value === row.stageId) selectedId.value = props.build.stages[0]?.stageId ?? null
  pending.value = null
}

const removeBody = computed(() => {
  const row = pending.value
  if (!row) return ''
  if (row.setCount === 0) return interpolate(DESIGN_COPY.removeStageBodyEmpty, { stage: row.name })
  return reassignTarget.value
    ? interpolate(DESIGN_COPY.removeStageBodyReassign, { n: row.setCount, other: reassignTarget.value.name })
    : interpolate(DESIGN_COPY.removeStageBodyDelete, { n: row.setCount })
})
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex flex-col gap-2">
      <h1 class="font-heading text-2xl font-bold leading-tight text-text">{{ COPY.stepStages }}</h1>
      <p class="text-sm leading-relaxed text-text-secondary">{{ DESIGN_COPY.stagesSub }}</p>
    </div>

    <div class="flex flex-col gap-2.5">
      <div
        v-for="row in rows"
        :key="row.stageId"
        class="flex items-center gap-3 rounded-[14px] p-3 ring-inset"
        :class="selectedId === row.stageId ? 'bg-surface ring-[1.5px] ring-primary' : 'bg-surface ring-0'"
      >
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-3 text-left"
          @click="selectedId = row.stageId"
        >
          <span
            class="size-[38px] shrink-0 rounded-[11px]"
            :style="{ background: clampStageColor(row.color) }"
          />
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="truncate text-sm font-semibold text-text">{{ row.name }}</span>
            <span class="text-xs text-text-secondary">
              {{ clampStageColor(row.color) }} · {{ row.setCount === 1 ? '1 set' : `${row.setCount} sets` }}
            </span>
          </span>
        </button>
        <button type="button" :aria-label="`Remove ${row.name}`" class="-m-1 p-1" @click="askRemove(row)">
          <UIcon name="i-lucide-x" class="size-[18px] text-text-muted" />
        </button>
      </div>

      <BuilderAddRow :label="DESIGN_COPY.addStageCta" @click="addStage" />
    </div>

    <!-- colour editor for the selected stage -->
    <div v-if="selected" class="flex flex-col gap-3 rounded-2xl bg-surface p-3.5">
      <p class="text-[11px] font-semibold uppercase tracking-[1px] text-text-muted">
        {{ interpolate(DESIGN_COPY.stageColourLabel, { stage: selected.name }) }}
      </p>

      <BuilderField :label="DESIGN_COPY.fieldName" icon="i-lucide-type">
        <input
          v-model="nameDraft"
          class="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-text outline-none"
          @blur="flushName"
        >
      </BuilderField>

      <div class="flex flex-wrap items-center gap-2.5">
        <button
          v-for="hex in SWATCHES"
          :key="hex"
          type="button"
          :aria-label="`Use ${hex}`"
          class="size-[30px] rounded-full"
          :class="selected.color.toUpperCase() === hex ? 'ring-2 ring-text ring-offset-2 ring-offset-surface' : ''"
          :style="{ background: hex }"
          @click="recolor(selected!.stageId, hex)"
        />
      </div>

      <div class="flex items-center gap-2 rounded-[10px] bg-surface-raised px-3 py-2.5">
        <UIcon name="i-lucide-hash" class="size-[15px] shrink-0 text-text-muted" />
        <input
          v-model="hexDraft"
          class="min-w-0 flex-1 bg-transparent text-[13px] font-semibold uppercase tracking-[0.4px] text-text outline-none"
          spellcheck="false"
          autocapitalize="off"
          maxlength="7"
          @blur="commitHex"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        >
        <span class="size-5 shrink-0 rounded-full" :style="{ background: clampStageColor(selected.color) }" />
      </div>

      <div class="flex items-start gap-2">
        <UIcon name="i-lucide-shield-check" class="mt-px size-[15px] shrink-0 text-info" />
        <p class="text-xs leading-relaxed text-text-secondary">{{ DESIGN_COPY.clampNote }}</p>
      </div>

      <!-- the real clamped result, rendered exactly as a timetable entry -->
      <div
        class="flex items-center gap-2.5 rounded-[10px] px-3 py-2.5"
        :style="{ ...previewVars, background: previewVars['--stage-tint'] }"
      >
        <span class="h-7 w-[3px] shrink-0 rounded-sm" :style="{ background: previewVars['--stage'] }" />
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="text-[13px] font-semibold text-text">Preview</span>
          <span class="text-[11px] text-text-secondary">18:00 – 18:45</span>
        </span>
        <span
          class="shrink-0 rounded-full px-2.5 py-[5px] text-[11px] font-semibold"
          :style="{ background: previewVars['--stage-chip'], color: previewVars['--stage'] }"
        >{{ selected.name }}</span>
      </div>
    </div>

    <CommonConfirmDialog
      v-model:open="confirmOpen"
      danger
      :title="DESIGN_COPY.removeStageTitle"
      :body="removeBody"
      :confirm-label="DESIGN_COPY.removeStageConfirm"
      :cancel-label="COPY.deleteBuildKeep"
      @confirm="confirmRemove"
      @cancel="pending = null"
    />
  </div>
</template>
