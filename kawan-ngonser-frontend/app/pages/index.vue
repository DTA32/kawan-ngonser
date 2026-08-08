<script setup lang="ts">
/**
 * The smart home: renders the concert-day board when exactly one planned
 * concert has today among its attending days, else the default home.
 * ?browse=1 forces the S-4 browse variant (LiveBanner instead of welcome).
 * Conditional render, not redirect — `/` stays the PWA start_url and the
 * midnight/day-boundary switch is pure reactivity.
 */
const route = useRoute()
const activeDay = useActiveConcertDay()

const browsing = computed(() => route.query.browse === '1')
const showConcertDay = computed(() => activeDay.value !== null && !browsing.value)
</script>

<template>
  <div class="flex flex-1 flex-col">
    <ChromeAppHeader :settings-event-id="showConcertDay ? activeDay!.eventId : null" />
    <ConcertDayView
      v-if="showConcertDay"
      :event-id="activeDay!.eventId"
      :day-index="activeDay!.dayState.todayDayIndex!"
    />
    <HomeDefaultView v-else :live-day="browsing ? activeDay : null" />
  </div>
</template>
