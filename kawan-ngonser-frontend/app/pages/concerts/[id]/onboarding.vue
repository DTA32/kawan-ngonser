<script setup lang="ts">
/**
 * The onboarding wizard (§6):
 *   days (skipped for single-day) → display → artists per selected day
 *   (each followed by its O-4 conflict queue) → all set.
 * Step synced to ?step= so hardware back walks the wizard; every answer
 * persists immediately (TR-4), so leaving and returning resumes.
 */
import type { ConflictPrompt } from '~/domain/types'
import { DESIGN_COPY, interpolate } from '~/utils/copy'
import { useConcertCacheStore } from '~/stores/concertCache'

definePageMeta({ layout: 'flow' })

const route = useRoute()
const router = useRouter()
const eventId = computed(() => route.params.id as string)

const cache = useConcertCacheStore()
const concert = computed(() => cache.getConcert(eventId.value))
const plan = usePlan(eventId)

// A concert must be cached (planned from server list or uploaded) to onboard
onMounted(() => {
  if (!concert.value) router.replace('/')
  else plan.ensurePlan()
})

// -- step machine ----------------------------------------------------------
const multiDay = computed(() => (concert.value?.days.length ?? 0) > 1)
const selectedDays = computed({
  get: () => plan.settings.value?.attendingDayIndexes ?? [],
  set: days => plan.selectDays(days),
})

const steps = computed<string[]>(() => {
  const s: string[] = []
  if (multiDay.value) s.push('days')
  s.push('display')
  for (const d of selectedDays.value) s.push(`artists-${d}`)
  s.push('allset')
  return s
})

const step = computed<string>(() => {
  const q = route.query.step
  return typeof q === 'string' && steps.value.includes(q) ? q : steps.value[0]!
})

const stepIndex = computed(() => steps.value.indexOf(step.value))

function goTo(next: string, replace = false) {
  const target = { query: { ...route.query, step: next } }
  replace ? router.replace(target) : router.push(target)
}

// Single-day concerts: auto-select the only day (O-1 skipped)
watch(concert, (c) => {
  if (c && c.days.length === 1 && selectedDays.value.length === 0)
    plan.selectDays([c.days[0]!.dayIndex])
}, { immediate: true })

// -- O-4 conflict queue ----------------------------------------------------
const conflictQueue = ref<ConflictPrompt[]>([])

function proceedFromArtists(dayIndex: number) {
  const prompts = plan.pendingConflicts(dayIndex)
  if (prompts.length > 0) {
    conflictQueue.value = prompts
  }
  else {
    advance()
  }
}

function onResolve(groupIds: string[], winnerId: string) {
  plan.resolveConflict(groupIds, winnerId)
  conflictQueue.value = conflictQueue.value.slice(1)
  if (conflictQueue.value.length === 0) {
    // re-check: resolution order can surface new preferred-preferred pairs
    const dayIndex = Number(step.value.split('-')[1])
    const remaining = plan.pendingConflicts(dayIndex)
    if (remaining.length > 0) conflictQueue.value = remaining
    else advance()
  }
}

function advance() {
  const i = stepIndex.value
  const next = steps.value[i + 1]
  if (next) goTo(next)
}

// -- per-step helpers ------------------------------------------------------
const currentArtistDay = computed(() =>
  step.value.startsWith('artists-') ? Number(step.value.split('-')[1]) : null)

const artistNextLabel = computed(() => {
  if (currentArtistDay.value === null) return DESIGN_COPY.finishCta
  const remaining = selectedDays.value.filter(d => d > currentArtistDay.value!)
  return remaining.length > 0
    ? interpolate(DESIGN_COPY.nextDayCta, { x: remaining[0]! })
    : DESIGN_COPY.finishCta
})

const conflictPref = computed({
  get: () => plan.settings.value?.conflictDisplayPref ?? 'equal',
  set: pref => plan.setConflictDisplayPref(pref),
})

const notifyBackburner = computed({
  get: () => plan.settings.value?.backburnerNotifyDefault ?? false,
  set: on => plan.setBackburnerNotifyDefault(on),
})

const dayState = useDayState(eventId)
</script>

<template>
  <div v-if="concert" class="flex flex-1 flex-col">
    <template v-if="step !== 'allset'">
      <ChromeNavHeader :title="concert.name" back-to="/" />
      <OnboardingProgress :total="steps.length - 1" :completed="stepIndex" />
    </template>

    <OnboardingStepDaySelection
      v-if="step === 'days'"
      v-model="selectedDays"
      :concert="concert"
      @proceed="advance"
    />

    <OnboardingStepConflictDisplay
      v-else-if="step === 'display'"
      v-model="conflictPref"
      v-model:notify-backburner="notifyBackburner"
      @proceed="advance"
    />

    <OnboardingStepArtistSelection
      v-else-if="currentArtistDay !== null"
      :concert="concert"
      :day-index="currentArtistDay"
      :performances="plan.schedule.value?.performances ?? []"
      :picks="plan.picks.value"
      :next-label="artistNextLabel"
      @toggle="id => plan.togglePick(id)"
      @proceed="proceedFromArtists(currentArtistDay)"
    />

    <OnboardingAllSetView
      v-else-if="step === 'allset'"
      :concert-name="concert.name"
      :kickoff-ms="dayState?.kickoffMs ?? null"
    />

    <OnboardingConflictSheet
      :concert="concert"
      :performances="plan.schedule.value?.performances ?? []"
      :prompts="conflictQueue"
      @resolve="onResolve"
    />
  </div>
</template>
