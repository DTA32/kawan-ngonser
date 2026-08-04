<script setup lang="ts">
defineProps<{
  settingsEventId?: string | null
}>()
</script>

<template>
  <header class="flex items-center justify-between px-5 py-3">
    <div class="flex items-center gap-2">
      <UIcon name="i-lucide-audio-lines" class="size-[22px] text-primary" />
      <span class="font-heading text-lg font-bold text-text">Kawan Ngonser</span>
    </div>
    <ChromeStatusIcons :settings-event-id="settingsEventId" />
  </header>
</template>
