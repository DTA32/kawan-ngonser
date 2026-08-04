<script setup lang="ts">
// G-3: renders nothing when the Battery Status API is unsupported (iOS Safari)
const battery = useBatteryStatus()
</script>

<template>
  <UIcon
    v-if="battery.supported.value && battery.low.value"
    name="i-lucide-battery-warning"
    class="size-5 text-warning"
  />
</template>
