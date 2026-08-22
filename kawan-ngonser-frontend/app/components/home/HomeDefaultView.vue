<script setup lang="ts">
/**
 * The default home (§5): welcome (C1), planned / available / past lists,
 * your builds (§13 B-2), JSON upload + Build a concert (H-6), install
 * reminder. In `browse` mode (S-4 "See other concerts"
 * while a concert day is live) the welcome hero is replaced by the LiveBanner
 * (design frame "Home – Other Concerts (S-4)").
 */
import { classifyPlannedConcert } from '~/domain/dayState'
import { buildEffectiveSchedule } from '~/domain/schedule'
import type { ConcertSummary } from '~/domain/types'
import { COPY, DESIGN_COPY } from '~/utils/copy'
import { formatDaysLabel } from '~/utils/time-format'
import { useBuildsStore } from '~/stores/builds'
import { useConcertCacheStore } from '~/stores/concertCache'
import { usePlanStore } from '~/stores/plan'
import type { ActiveConcertDay } from '~/composables/useActiveConcertDay'

const props = defineProps<{
  /** Set when rendered via ?browse=1 while a concert day is live */
  liveDay?: ActiveConcertDay | null
}>()

const cache = useConcertCacheStore()
const planStore = usePlanStore()
const builds = useBuildsStore()
const { online } = useConnectivity()
const now = useNow()
const router = useRouter()

// -- planned concerts (a: upcoming incl. ongoing, c: past) -----------------
const planned = computed(() => {
  const out: { summary: ConcertSummary, stageCount: number, group: 'upcoming' | 'past' }[] = []
  for (const eventId of planStore.plannedEventIds) {
    const concert = cache.getConcert(eventId)
    const plan = planStore.getPlan(eventId)
    if (!concert || !plan) continue
    const schedule = buildEffectiveSchedule(concert, plan.overrides, plan.customEvents)
    out.push({
      summary: concert,
      stageCount: concert.stages.length,
      group: classifyPlannedConcert(schedule, plan.settings, now.value),
    })
  }
  return out
})
const upcomingPlanned = computed(() => planned.value.filter(p => p.group === 'upcoming'))
const pastPlanned = computed(() => planned.value.filter(p => p.group === 'past'))

// -- available from server (b), minus already planned ----------------------
const availableToPlan = computed(() =>
  cache.available.filter(c => !planStore.hasPlan(c.eventId)))
// Cached-but-unplanned concerts (e.g. JSON uploaded, onboarding not started)
const uploadedUnplanned = computed(() =>
  cache.cachedConcerts.filter(c =>
    !planStore.hasPlan(c.eventId)
    && !availableToPlan.value.some(a => a.eventId === c.eventId)))

async function refresh() {
  if (online.value) await cache.refreshAvailable(useApi())
}
onMounted(refresh)
watch(online, isOn => isOn && refresh())

// -- detail sheet (H-5) ----------------------------------------------------
const sheetOpen = ref(false)
const selected = ref<{ summary: ConcertSummary, stageCount: number | null } | null>(null)

async function openDetail(summary: ConcertSummary, stageCount: number | null) {
  selected.value = { summary, stageCount }
  // Mount closed first, open next tick — a drawer that mounts already-open
  // never registers its dismiss/focus layer (overlay click + ESC go dead)
  await nextTick()
  sheetOpen.value = true
}

function chipsFor(eventId: string): string[] {
  const days = planStore.getPlan(eventId)?.settings.attendingDayIndexes ?? []
  return days.map(d => `Day ${d}`)
}

function dateLabelOf(c: ConcertSummary): string {
  return formatDaysLabel(c.days, c.timezone)
}
</script>

<template>
  <main class="flex flex-1 flex-col gap-7 px-5 pb-7 pt-2">
    <!-- Browse mode: live banner instead of the welcome hero (S-4 design) -->
    <HomeLiveBanner
      v-if="liveDay"
      :day-index="liveDay.dayState.todayDayIndex ?? 1"
      @open="router.push('/')"
    />
    <div v-else class="flex flex-col gap-2.5">
      <h1 class="font-heading text-[27px] font-bold leading-tight text-text">
        {{ COPY.welcomeHeadline }}
      </h1>
      <p class="text-sm leading-relaxed text-text-secondary">
        {{ COPY.welcomeSub }}
      </p>
    </div>

    <!-- (a) upcoming planned -->
    <section class="flex flex-col gap-3">
      <CommonSectionLabel>Your concerts</CommonSectionLabel>
      <template v-if="upcomingPlanned.length">
        <HomeConcertListItem
          v-for="p in upcomingPlanned"
          :key="p.summary.eventId"
          :name="p.summary.name"
          :date-label="dateLabelOf(p.summary)"
          :logo="p.summary.logo"
          variant="planned"
          :chips="chipsFor(p.summary.eventId)"
          @select="liveDay?.eventId === p.summary.eventId
            ? router.push('/')
            : openDetail(p.summary, p.stageCount)"
        />
      </template>
      <CommonEmptyState v-else card icon="i-lucide-calendar-plus" :main="DESIGN_COPY.emptyPlanned" />
    </section>

    <!-- (b) available to plan (server) + upload -->
    <section class="flex flex-col gap-3">
      <CommonSectionLabel>Available to plan</CommonSectionLabel>
      <HomeConcertListItem
        v-for="c in uploadedUnplanned"
        :key="c.eventId"
        :name="c.name"
        :date-label="dateLabelOf(c)"
        :logo="c.logo"
        variant="available"
        @select="openDetail(c, c.stages.length)"
      />
      <template v-if="online">
        <CommonSkeletonList v-if="cache.availableStatus === 'loading'" :rows="2" />
        <template v-else-if="cache.availableStatus === 'ok'">
          <HomeConcertListItem
            v-for="c in availableToPlan"
            :key="c.eventId"
            :name="c.name"
            :date-label="dateLabelOf(c)"
            :logo="c.logo"
            variant="available"
            @select="openDetail(c, null)"
          />
          <CommonEmptyState
            v-if="availableToPlan.length === 0 && uploadedUnplanned.length === 0"
            card
            icon="i-lucide-telescope"
            :main="DESIGN_COPY.emptyAvailableNone"
            :sub="DESIGN_COPY.emptyAvailableNoneSub"
          />
        </template>
        <CommonEmptyState
          v-else-if="cache.availableStatus === 'unavailable'"
          card
          icon="i-lucide-cloud-off"
          main="Couldn't reach the concert server — try again in a bit."
          sub="Saved plans and JSON upload still work."
        />
      </template>
      <CommonEmptyState
        v-else
        card
        icon="i-lucide-wifi-off"
        :main="DESIGN_COPY.emptyAvailableOffline"
        :sub="DESIGN_COPY.emptyAvailableOfflineSub"
      />
      <HomeUploadJsonCard @uploaded="id => router.push(`/concerts/${id}/onboarding`)" />
      <!-- H-6 -->
      <HomeBuildConcertCard />
    </section>

    <!-- (c) past planned -->
    <section class="flex flex-col gap-3">
      <CommonSectionLabel>Past concerts</CommonSectionLabel>
      <template v-if="pastPlanned.length">
        <HomeConcertListItem
          v-for="p in pastPlanned"
          :key="p.summary.eventId"
          :name="p.summary.name"
          :date-label="dateLabelOf(p.summary)"
          :logo="p.summary.logo"
          variant="past"
          @select="openDetail(p.summary, p.stageCount)"
        />
      </template>
      <CommonEmptyState v-else card icon="i-lucide-history" :main="DESIGN_COPY.emptyPast" />
    </section>

    <!-- (d) your builds (B-2) — omitted when empty; the H-6 card is the
         empty state, so an untouched home gains nothing to scroll past -->
    <section v-if="builds.allBuilds.length" class="flex flex-col gap-3">
      <CommonSectionLabel>{{ COPY.buildsSectionLabel }}</CommonSectionLabel>
      <HomeBuildListItem
        v-for="b in builds.allBuilds"
        :key="b.buildId"
        :build="b"
      />
    </section>

    <ChromeInstallReminder />

    <HomeConcertDetailSheet
      v-if="selected"
      v-model:open="sheetOpen"
      :concert="selected.summary"
      :stage-count="selected.stageCount"
    />
  </main>
</template>
