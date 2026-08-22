<script setup lang="ts">
/**
 * H-5 concert detail sheet. Three variants:
 *  - unplanned            → C7 "Plan for this concert"
 *  - planned, upcoming    → attended-day preview rows + "Edit your plan"
 *                           (re-runs onboarding with answers pre-filled)
 *  - planned, past        → attended-day preview rows only (relive the days)
 *
 * All three also carry B-15 "Edit a copy": fork the concert data into the
 * Concert Builder under a fresh event id. Available for server, uploaded and
 * built concerts alike — the fork never touches the original or its plan, so
 * there is nothing to protect it from.
 */
import { getConcert } from '~/api/endpoints'
import { classifyPlannedConcert } from '~/domain/dayState'
import { buildEffectiveSchedule } from '~/domain/schedule'
import type { ConcertSummary } from '~/domain/types'
import { warmConcertImages } from '~/services/imageCache'
import { COPY, DESIGN_COPY, interpolate } from '~/utils/copy'
import { formatDaysLabel, formatDayTitle, formatTagline } from '~/utils/time-format'
import { useBuildsStore } from '~/stores/builds'
import { useConcertCacheStore } from '~/stores/concertCache'
import { usePlanStore } from '~/stores/plan'

const props = defineProps<{
  concert: ConcertSummary
  /** stages count when known (cached concerts); null for server summaries */
  stageCount: number | null
}>()

const open = defineModel<boolean>('open', { required: true })

const cache = useConcertCacheStore()
const planStore = usePlanStore()
const builds = useBuildsStore()
const now = useNow()

const imgFailed = ref(false)

const plan = computed(() => planStore.getPlan(props.concert.eventId))
const cached = computed(() => cache.getConcert(props.concert.eventId))

const variant = computed<'unplanned' | 'upcoming' | 'past'>(() => {
  if (!plan.value || !cached.value) return 'unplanned'
  const schedule = buildEffectiveSchedule(cached.value, plan.value.overrides, plan.value.customEvents)
  return classifyPlannedConcert(schedule, plan.value.settings, now.value)
})

const attendingDays = computed(() => {
  if (!plan.value || !cached.value) return []
  const concert = cached.value
  const dayPerfIds = new Map(concert.days.map(d => [
    d.dayIndex,
    new Set(concert.performances.filter(p => p.dayIndex === d.dayIndex).map(p => p.performanceId)),
  ]))
  return plan.value.settings.attendingDayIndexes.map((dayIndex) => {
    const date = concert.days.find(d => d.dayIndex === dayIndex)?.date ?? ''
    const ids = dayPerfIds.get(dayIndex) ?? new Set()
    const pickCount = Object.values(plan.value!.picks)
      .filter(p => p.status === 'preferred' && ids.has(p.performanceId))
      .length
    return { dayIndex, date, pickCount }
  })
})

const dateLabel = computed(() => formatDaysLabel(props.concert.days, props.concert.timezone))
const tagline = computed(() =>
  props.stageCount === null
    ? `Music festival · ${props.concert.days.length === 1 ? '1 day' : `${props.concert.days.length} days`}`
    : formatTagline(props.concert.days.length, props.stageCount))

function dayTitle(dayIndex: number, date: string): string {
  return formatDayTitle(dayIndex, date, props.concert.timezone)
}

const downloading = ref(false)
const toast = useToast()
const { online } = useConnectivity()

/**
 * C7: onboarding needs the FULL payload cached. Upload-planned concerts
 * already have it; server-listed ones are downloaded here first.
 */
async function planIt() {
  if (!cached.value) {
    downloading.value = true
    try {
      const { payload, result } = await getConcert(useApi(), props.concert.eventId)
      if (!result.ok) throw new Error(result.errors[0])
      cache.savePayload(payload, 'server', nowMs())
      void warmConcertImages(result.concert, online.value)
    }
    catch {
      toast.add({
        description: DESIGN_COPY.downloadFailure,
        icon: 'i-lucide-cloud-off',
        color: 'error',
      })
      return
    }
    finally {
      downloading.value = false
    }
  }
  open.value = false
  await navigateTo(`/concerts/${props.concert.eventId}/onboarding`)
}

function previewDay(dayIndex: number) {
  open.value = false
  navigateTo(`/concerts/${props.concert.eventId}/day/${dayIndex}`)
}

function editPlan() {
  open.value = false
  navigateTo(`/concerts/${props.concert.eventId}/onboarding`)
}

/**
 * B-15. Needs the FULL cached payload — a server summary has no performances
 * to fork — so it is only offered for concerts already on the device.
 */
function editACopy() {
  const concert = cached.value
  if (!concert) return
  const build = builds.forkFromConcert(concert, nowMs())
  toast.add({
    description: interpolate(COPY.toastForked, { concert: build.name }),
    icon: 'i-lucide-copy',
    color: 'success',
  })
  open.value = false
  navigateTo(`/builds/${build.buildId}?step=details`)
}
</script>

<template>
  <CommonBottomSheet v-model:open="open">
    <div class="flex items-center gap-3.5">
      <div class="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl" :class="!concert.logo || imgFailed ? 'hero-gradient' : 'bg-surface-raised'">
        <img
          v-if="concert.logo && !imgFailed"
          :src="concert.logo"
          alt=""
          class="size-full object-cover"
          @error="imgFailed = true"
        >
        <UIcon v-else name="i-lucide-music-4" class="size-[30px] text-white" />
      </div>
      <div class="flex min-w-0 flex-col gap-1">
        <h2 class="font-heading text-[21px] font-bold leading-tight text-text">{{ concert.name }}</h2>
        <p class="text-[13px] text-text-secondary">{{ tagline }}</p>
      </div>
    </div>

    <div class="flex flex-col gap-2.5">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-calendar-days" class="size-4 text-text-secondary" />
        <span class="text-sm text-text-secondary">{{ dateLabel }}</span>
      </div>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-map-pin" class="size-4 text-text-secondary" />
        <span class="text-sm text-text-secondary">{{ concert.place }}</span>
      </div>
    </div>

    <p v-if="concert.description && variant === 'unplanned'" class="text-[13px] leading-relaxed text-text-secondary">
      {{ concert.description }}
    </p>

    <!-- unplanned: C7 -->
    <button
      v-if="variant === 'unplanned'"
      type="button"
      class="flex w-full items-center justify-center gap-2 rounded-[28px] bg-primary px-6 py-3.5 text-[15px] font-semibold text-on-primary active:bg-primary-pressed disabled:opacity-60"
      :disabled="downloading"
      @click="planIt"
    >
      <UIcon v-if="downloading" name="i-lucide-loader-circle" class="size-4 animate-spin" />
      {{ COPY.planCta }}
    </button>

    <!-- planned (upcoming or past): the user's days, tap to preview -->
    <template v-else>
      <div class="flex flex-col gap-2.5">
        <CommonSectionLabel>{{ DESIGN_COPY.yourDaysLabel }}</CommonSectionLabel>
        <button
          v-for="day in attendingDays"
          :key="day.dayIndex"
          type="button"
          class="flex w-full items-center gap-3 rounded-xl bg-surface p-3.5 text-left"
          @click="previewDay(day.dayIndex)"
        >
          <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12">
            <UIcon name="i-lucide-calendar-days" class="size-5 text-primary" />
          </span>
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="text-[15px] font-semibold text-text">{{ dayTitle(day.dayIndex, day.date) }}</span>
            <span class="text-xs text-text-secondary">
              {{ interpolate(DESIGN_COPY.dayPreviewSub, { n: day.pickCount }) }}
            </span>
          </span>
          <UIcon name="i-lucide-chevron-right" class="size-[18px] shrink-0 text-text-muted" />
        </button>
      </div>

      <!-- upcoming only: re-run onboarding with the current answers -->
      <button
        v-if="variant === 'upcoming'"
        type="button"
        class="flex w-full items-center justify-center gap-2 rounded-[28px] bg-surface px-6 py-3.5 text-[15px] font-semibold text-text ring-1 ring-inset ring-border"
        @click="editPlan"
      >
        <UIcon name="i-lucide-pencil" class="size-4" />
        {{ DESIGN_COPY.editPlanCta }}
      </button>
    </template>

    <!-- B-15: secondary to whichever primary CTA the variant showed. Needs
         the full cached payload — a server summary has no sets to fork. -->
    <button
      v-if="cached"
      type="button"
      class="flex w-full items-center justify-center gap-2 rounded-[28px] px-6 py-3 text-sm font-semibold text-text-secondary"
      @click="editACopy"
    >
      <UIcon name="i-lucide-copy" class="size-4" />
      {{ COPY.editACopyCta }}
    </button>
  </CommonBottomSheet>
</template>
