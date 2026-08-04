<script setup lang="ts">
// G-1 / C2: in normal content flow (never sticky), shown until installed.
// Chromium: tapping triggers the captured native prompt. iOS: expands to
// Share → Add to Home Screen instructions (no prompt API).
import { COPY } from '~/utils/copy'

const install = useInstallPrompt()
const showIOSHelp = ref(false)

async function onTap() {
  if (install.canPrompt.value) await install.prompt()
  else if (install.isIOS) showIOSHelp.value = !showIOSHelp.value
}
</script>

<template>
  <button
    v-if="!install.installed.value"
    type="button"
    class="flex w-full items-start gap-3 rounded-2xl bg-info/8 p-3.5 text-left"
    @click="onTap"
  >
    <UIcon name="i-lucide-arrow-down-to-line" class="mt-0.5 size-5 shrink-0 text-info" />
    <span class="text-[13px] leading-relaxed text-text-secondary">
      {{ COPY.installReminder }}
      <span v-if="showIOSHelp" class="mt-1 block text-text">
        Tap the Share button in Safari, then "Add to Home Screen".
      </span>
    </span>
  </button>
</template>
