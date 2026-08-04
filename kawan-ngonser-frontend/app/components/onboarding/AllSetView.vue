<script setup lang="ts">
// O-5 "All set!" — C9 when the concert is already on, C10 + live countdown
// otherwise. Also the contextual notification-permission ask (user gesture).
import { COPY, DESIGN_COPY, interpolate } from '~/utils/copy'

const props = defineProps<{
  concertName: string
  /** null → ongoing (C9); epoch ms → countdown target (C10) */
  kickoffMs: number | null
}>()

const now = useNow(1000)
const ongoing = computed(() => props.kickoffMs === null || props.kickoffMs <= now.value)

// Plan is committed — ask the browser to keep our storage (opaque image
// cache counts generously against quota on Chromium)
onMounted(() => {
  void import('~/services/imageCache').then(m => m.requestPersistentStorage())
})

// -- notification permission (N-1 prep; scheduler lands in phase 7) --------
const supported = typeof window !== 'undefined' && 'Notification' in window
const permission = ref(supported ? Notification.permission : 'unsupported')

async function enableNotifications() {
  if (!supported) return
  permission.value = await Notification.requestPermission()
}
</script>

<template>
  <div class="flex flex-1 flex-col items-center justify-center gap-6 px-7">
    <div
      class="hero-gradient flex size-[100px] items-center justify-center rounded-[50px]"
      style="box-shadow: 0 8px 40px #7C5CFF59"
    >
      <UIcon name="i-lucide-party-popper" class="size-[42px] text-white" />
    </div>

    <div class="flex flex-col items-center gap-2.5">
      <h1 class="font-heading text-[30px] font-bold text-text">{{ DESIGN_COPY.allSetTitle }}</h1>
      <p class="text-center text-[15px] leading-snug text-text-secondary">
        {{ ongoing ? COPY.allSetOngoing : interpolate(COPY.allSetUpcoming, { concert: concertName }) }}
      </p>
    </div>

    <OnboardingCountdownTiles v-if="!ongoing && kickoffMs" :target-ms="kickoffMs" />

    <div class="flex w-full flex-col gap-3">
      <button
        type="button"
        class="w-full rounded-[28px] bg-primary px-6 py-3.5 text-[15px] font-semibold text-on-primary"
        @click="navigateTo('/')"
      >
        {{ DESIGN_COPY.takeMeHomeCta }}
      </button>

      <!-- contextual permission ask — never on load, always on a gesture -->
      <button
        v-if="permission === 'default'"
        type="button"
        class="w-full rounded-[28px] bg-surface-raised px-6 py-3.5 text-[15px] font-semibold text-text ring-1 ring-inset ring-border"
        @click="enableNotifications"
      >
        Turn on notifications
      </button>
      <p v-else-if="permission === 'granted'" class="text-center text-xs text-text-secondary">
        <UIcon name="i-lucide-bell-ring" class="mr-1 inline size-3.5 align-[-2px] text-success" />
        You'll get a nudge before every set you picked.
      </p>
      <p v-else-if="permission === 'denied'" class="text-center text-xs leading-snug text-text-muted">
        Notifications are off — enable them for this site in your browser settings to get nudges.
      </p>
      <p v-else-if="permission === 'unsupported'" class="text-center text-xs leading-snug text-text-muted">
        Install the app to your home screen to get set reminders.
      </p>
    </div>
  </div>
</template>
