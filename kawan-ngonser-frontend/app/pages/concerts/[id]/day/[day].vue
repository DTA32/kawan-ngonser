<script setup lang="ts">
// W-5 / C22 / W-7: any attending day's board. Which side of now it sits on is
// derived inside ConcertDayView, which already holds the schedule and clock.
const route = useRoute()
const eventId = computed(() => route.params.id as string)
const dayIndex = computed(() => Number(route.params.day))

const plan = usePlan(eventId)

onMounted(() => {
  const valid = plan.settings.value?.attendingDayIndexes.includes(dayIndex.value)
  if (!plan.exists.value || !valid) navigateTo('/', { replace: true })
})
</script>

<template>
  <div class="flex flex-1 flex-col">
    <ChromeAppHeader :settings-event-id="eventId" />
    <ConcertDayView :event-id="eventId" :day-index="dayIndex" />
  </div>
</template>
