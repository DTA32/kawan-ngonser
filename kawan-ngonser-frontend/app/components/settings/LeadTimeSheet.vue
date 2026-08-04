<script setup lang="ts">
// S-2: lead-time override — grid of options, DEFAULT tag on the config value.
// Also the secondary notification-permission surface.
import { useAppConfigStore } from '~/stores/appConfig'

const props = defineProps<{ eventId: string }>()
const emit = defineEmits<{ saved: [min: number] }>()

const open = defineModel<boolean>('open', { required: true })

const appConfig = useAppConfigStore()
const plan = usePlan(() => props.eventId)

const OPTIONS = [5, 10, 15, 20, 30, 45]

const defaultMin = computed(() => appConfig.config.defaultLeadTimeMin)
const currentMin = computed(() =>
  plan.settings.value?.leadTimeOverrideMin ?? defaultMin.value)

function choose(min: number) {
  // choosing the config default clears the override (falls back, S-2)
  plan.setLeadTimeOverride(min === defaultMin.value ? null : min)
  emit('saved', min)
  open.value = false
}

const supported = typeof window !== 'undefined' && 'Notification' in window
const permission = ref(supported ? Notification.permission : 'unsupported')

async function enable() {
  if (!supported) return
  permission.value = await Notification.requestPermission()
}
</script>

<template>
  <CommonBottomSheet v-model:open="open">
    <div class="flex flex-col gap-1.5">
      <h2 class="font-heading text-[19px] font-bold text-text">Notification lead time</h2>
      <p class="text-[13px] text-text-secondary">How early should we nudge you before each set?</p>
    </div>

    <div class="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Lead time">
      <button
        v-for="min in OPTIONS"
        :key="min"
        type="button"
        role="radio"
        :aria-checked="currentMin === min"
        class="flex flex-col items-center gap-0.5 rounded-xl py-3"
        :class="currentMin === min
          ? 'bg-primary/10 ring-[1.5px] ring-inset ring-primary'
          : 'bg-surface'"
        @click="choose(min)"
      >
        <span class="text-[15px] font-semibold" :class="currentMin === min ? 'text-primary' : 'text-text'">
          {{ min }} min
        </span>
        <span v-if="min === defaultMin" class="text-[10px] font-semibold tracking-[0.5px] text-text-muted">
          DEFAULT
        </span>
      </button>
    </div>

    <p class="text-xs leading-snug text-text-muted">
      The default comes from app config — your choice here overrides it for this concert.
    </p>

    <button
      v-if="permission === 'default'"
      type="button"
      class="w-full rounded-[28px] bg-surface px-6 py-3 text-sm font-semibold text-text ring-1 ring-inset ring-border"
      @click="enable"
    >
      Turn on notifications
    </button>
    <p v-else-if="permission === 'denied'" class="text-xs leading-snug text-text-muted">
      Notifications are blocked — enable them for this site in your browser settings to get nudges.
    </p>
  </CommonBottomSheet>
</template>
