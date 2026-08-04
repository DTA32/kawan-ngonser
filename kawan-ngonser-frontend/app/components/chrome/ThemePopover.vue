<script setup lang="ts">
// G-5 / C24: three-state theme choice, applied instantly, persisted app-wide
import { COPY } from '~/utils/copy'

const { preference, resolved } = useAppTheme()

const popoverOpen = ref(false)

function choose(value: 'system' | 'light' | 'dark') {
  preference.value = value
  popoverOpen.value = false // single-select → picking closes, like the settings sheets
}

const options = [
  { value: 'system', label: COPY.themeSystem, icon: 'i-lucide-monitor' },
  { value: 'light', label: COPY.themeLight, icon: 'i-lucide-sun' },
  { value: 'dark', label: COPY.themeDark, icon: 'i-lucide-moon' },
] as const
</script>

<template>
  <UPopover v-model:open="popoverOpen" :content="{ side: 'bottom', align: 'end', sideOffset: 8 }">
    <button type="button" aria-label="Theme" class="flex items-center">
      <UIcon
        :name="resolved === 'light' ? 'i-lucide-sun' : 'i-lucide-moon'"
        class="size-5 text-text-secondary"
      />
    </button>
    <template #content>
      <div class="w-[190px] rounded-[14px] border border-border bg-surface-raised p-2">
        <p class="px-2.5 pb-1 pt-1.5 text-xs font-semibold tracking-[0.5px] text-text-muted">
          {{ COPY.themeTitle.toUpperCase() }}
        </p>
        <button
          v-for="opt in options"
          :key="opt.value"
          type="button"
          class="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-[9px] text-left"
          :class="preference === opt.value ? 'bg-primary/10' : ''"
          role="radio"
          :aria-checked="preference === opt.value"
          @click="choose(opt.value)"
        >
          <UIcon
            :name="opt.icon"
            class="size-4"
            :class="preference === opt.value ? 'text-primary' : 'text-text-secondary'"
          />
          <span
            class="flex-1 text-sm"
            :class="preference === opt.value ? 'font-semibold text-text' : 'text-text-secondary'"
          >{{ opt.label }}</span>
          <UIcon
            v-if="preference === opt.value"
            name="i-lucide-check"
            class="size-[15px] text-primary"
          />
        </button>
      </div>
    </template>
  </UPopover>
</template>
