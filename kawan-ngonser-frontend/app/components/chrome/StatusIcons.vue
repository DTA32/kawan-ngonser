<script setup lang="ts">
// Right side of the App Header: battery (conditional) · theme · globe · gear
// (concert-day context only — settings are concert-scoped)
defineProps<{
  settingsEventId?: string | null
}>()
</script>

<template>
  <div class="flex items-center gap-3">
    <ChromeBatteryIndicator />
    <ChromeThemePopover />
    <ChromeConnectivityPopover />
    <NuxtLink
      v-if="settingsEventId"
      :to="`/concerts/${settingsEventId}/settings`"
      aria-label="Settings"
      class="flex items-center"
    >
      <UIcon name="i-lucide-settings" class="size-5 text-text-secondary" />
    </NuxtLink>
  </div>
</template>
