<script setup lang="ts">
/**
 * B-3 step rail. Tappable pills rather than the linear onboarding progress
 * bars (OnboardingProgress) — authoring is non-linear: any step, any order,
 * leave and come back. The dot shows whether a step has content yet.
 */
import type { BuildStep } from '~/domain/builder-steps'
import { BUILD_STEPS } from '~/domain/builder-steps'

defineProps<{
  active: BuildStep
  /** Steps that already have content — a green dot instead of a muted one */
  filled: Set<BuildStep>
}>()

const emit = defineEmits<{ select: [BuildStep] }>()
</script>

<template>
  <nav class="flex items-center gap-2 px-5 py-2" aria-label="Builder steps">
    <button
      v-for="s in BUILD_STEPS"
      :key="s.id"
      type="button"
      :aria-current="active === s.id ? 'step' : undefined"
      class="flex items-center gap-[7px] rounded-full px-3 py-[7px] text-[13px] font-semibold ring-inset transition-colors"
      :class="active === s.id
        ? 'bg-primary/10 text-primary ring-[1.5px] ring-primary'
        : 'bg-surface text-text-secondary ring-1 ring-border'"
      @click="emit('select', s.id)"
    >
      <span
        class="size-1.5 shrink-0 rounded-full"
        :class="active === s.id ? 'bg-primary' : filled.has(s.id) ? 'bg-success' : 'bg-text-muted'"
      />
      {{ s.short }}
    </button>
  </nav>
</template>
