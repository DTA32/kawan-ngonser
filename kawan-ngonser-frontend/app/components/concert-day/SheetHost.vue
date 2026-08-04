<script setup lang="ts">
// Renders whatever overlay sheet is on top of the useSheets stack.
const sheets = useSheets()

const top = sheets.top

const open = computed({
  get: () => top.value !== null && top.value.kind !== 'conflict',
  set: (v) => { if (!v) sheets.close() },
})

function onEdit() {
  const t = top.value
  if (t?.kind === 'performance')
    sheets.replace({ kind: 'editPerformance', eventId: t.eventId, performanceId: t.performanceId })
}
</script>

<template>
  <CommonBottomSheet v-model:open="open">
    <ConcertDaySheetsPerformanceSheet
      v-if="top?.kind === 'performance'"
      :event-id="top.eventId"
      :performance-id="top.performanceId"
      @close="sheets.close()"
      @edit="onEdit"
    />
    <ConcertDaySheetsEditPerformanceSheet
      v-else-if="top?.kind === 'editPerformance'"
      :event-id="top.eventId"
      :performance-id="top.performanceId"
      @close="sheets.close()"
    />
    <ConcertDaySheetsCustomEventSheet
      v-else-if="top?.kind === 'customEvent'"
      :event-id="top.eventId"
      :custom-event-id="top.customEventId"
      :prefill-start-ms="top.prefillStartMs"
      @close="sheets.close()"
    />
  </CommonBottomSheet>
</template>
