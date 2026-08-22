<script setup lang="ts">
/**
 * The Concert Builder shell (B-3). Non-linear by design: the step lives in
 * ?step= so any step is reachable in any order and hardware back walks the
 * history, but unlike onboarding (§6) there is no gate between steps and no
 * finish button — a build is done when it is Ready (B-10).
 */
import { type BuildPerformance, buildToWirePayload, readiness } from '~/domain/builds'
import { type BuildStep, isBuildStep } from '~/domain/builder-steps'
import { warmConcertImages } from '~/services/imageCache'
import { COPY, DESIGN_COPY, interpolate } from '~/utils/copy'
import { useBuildsStore } from '~/stores/builds'
import { useConcertCacheStore } from '~/stores/concertCache'

definePageMeta({ layout: 'flow' })

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { online } = useConnectivity()

const builds = useBuildsStore()
const cache = useConcertCacheStore()

const buildId = computed(() => route.params.buildId as string)
const build = computed(() => builds.getBuild(buildId.value))

onMounted(() => {
  if (!build.value) router.replace('/')
})

const step = computed<BuildStep>(() => (isBuildStep(route.query.step) ? route.query.step : 'details'))

function goToStep(next: BuildStep) {
  router.replace({ query: { ...route.query, step: next } })
}

/** Which rail dots are green — "has content", not "is valid". */
const filled = computed(() => {
  const b = build.value
  const set = new Set<BuildStep>()
  if (!b) return set
  if (b.name.trim()) set.add('details')
  if (b.days.length) set.add('days')
  if (b.stages.length) set.add('stages')
  if (b.performances.length) set.add('sets')
  return set
})

// -- set sheet (B-8) -------------------------------------------------------
const sheetOpen = ref(false)
const editing = ref<BuildPerformance | null>(null)
const sheetDayIndex = ref(1)

function openAdd(dayIndex: number) {
  editing.value = null
  sheetDayIndex.value = dayIndex
  sheetOpen.value = true
}

function openEdit(perf: BuildPerformance) {
  editing.value = perf
  sheetDayIndex.value = perf.dayIndex
  sheetOpen.value = true
}

// -- export (B-13) ---------------------------------------------------------
const exportOpen = ref(false)

// -- plan it (B-12) --------------------------------------------------------
/**
 * The build is materialized into the concert cache through the SAME parser an
 * upload goes through, so a built concert and an uploaded one are
 * indistinguishable downstream. The build itself stays put and stays editable.
 */
async function planIt() {
  const b = build.value
  if (!b || !readiness(b).ready) return
  const result = cache.savePayload(buildToWirePayload(b), 'builder', nowMs())
  if (!result.ok) {
    toast.add({ description: COPY.uploadFailure, icon: 'i-lucide-circle-alert', color: 'error' })
    console.warn('[kawan-ngonser] build failed to normalize:', result.errors)
    return
  }
  void warmConcertImages(result.concert, online.value)
  toast.add({
    description: interpolate(COPY.toastPlannedFromBuild, { concert: b.name }),
    icon: 'i-lucide-circle-check',
    color: 'success',
  })
  await navigateTo(`/concerts/${b.eventId}/onboarding`)
}

// -- delete (B-16) ---------------------------------------------------------
const deleteOpen = ref(false)

function confirmDelete() {
  builds.remove(buildId.value)
  toast.add({ description: COPY.toastBuildDeleted, icon: 'i-lucide-circle-check', color: 'success' })
  router.replace('/')
}
</script>

<template>
  <div v-if="build" class="flex flex-1 flex-col">
    <ChromeNavHeader :title="build.name || DESIGN_COPY.builderNewTitle" back-to="/">
      <template #actions>
        <UDropdownMenu
          :items="[[
            { label: COPY.exportShare, icon: 'i-lucide-share-2', onSelect: () => (exportOpen = true) },
            { label: COPY.deleteBuildConfirm, icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => (deleteOpen = true) },
          ]]"
        >
          <button type="button" aria-label="Build actions" class="-mr-1 p-1">
            <UIcon name="i-lucide-ellipsis-vertical" class="size-5 text-text-secondary" />
          </button>
        </UDropdownMenu>
      </template>
    </ChromeNavHeader>

    <BuilderStepRail :active="step" :filled="filled" @select="goToStep" />

    <div class="flex flex-1 flex-col px-5 pb-7 pt-5">
      <BuilderStepDetails v-if="step === 'details'" :build="build" />
      <BuilderStepDays v-else-if="step === 'days'" :build="build" />
      <BuilderStepStages v-else-if="step === 'stages'" :build="build" />
      <BuilderStepPerformances
        v-else
        :build="build"
        @add="openAdd"
        @edit="openEdit"
        @plan="planIt"
        @export="exportOpen = true"
      />
    </div>

    <BuilderPerformanceSheet
      v-model:open="sheetOpen"
      :build="build"
      :performance="editing"
      :default-day-index="sheetDayIndex"
    />
    <BuilderExportSheet v-model:open="exportOpen" :build="build" />

    <CommonConfirmDialog
      v-model:open="deleteOpen"
      danger
      :title="COPY.deleteBuildTitle"
      :body="interpolate(COPY.deleteBuildBody, { concert: build.name || DESIGN_COPY.builderNewTitle })"
      :confirm-label="COPY.deleteBuildConfirm"
      :cancel-label="COPY.deleteBuildKeep"
      @confirm="confirmDelete"
    />
  </div>
</template>
