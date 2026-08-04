<script setup lang="ts">
// W-5 / C22: another day's board in preview mode (or today's, if the route
// points at the live day).
const route = useRoute()
const eventId = computed(() => route.params.id as string)
const dayIndex = computed(() => Number(route.params.day))

const activeDay = useActiveConcertDay()
const plan = usePlan(eventId)

const mode = computed(() =>
  activeDay.value?.eventId === eventId.value
  && activeDay.value.dayState.todayDayIndex === dayIndex.value
    ? 'today' as const
    : 'preview' as const)

onMounted(() => {
  const valid = plan.settings.value?.attendingDayIndexes.includes(dayIndex.value)
  if (!plan.exists.value || !valid) navigateTo('/', { replace: true })
})
</script>

<template>
  <div class="flex flex-1 flex-col">
    <ChromeAppHeader :settings-event-id="eventId" />
    <ConcertDayView :event-id="eventId" :day-index="dayIndex" :mode="mode" />
  </div>
</template>
