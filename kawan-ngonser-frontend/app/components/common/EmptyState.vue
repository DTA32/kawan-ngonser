<script setup lang="ts">
// All six design variants share this anatomy: centered muted icon + main
// line + optional sub line. `card` wraps it in a $surface tile (home lists).
defineProps<{
  icon: string
  main: string
  sub?: string
  card?: boolean
}>()
</script>

<template>
  <div :class="card ? 'rounded-2xl bg-surface' : ''">
    <div class="flex flex-col items-center gap-2 px-3 py-[18px] text-center">
      <UIcon :name="icon" class="size-[22px] text-text-muted" />
      <p class="text-[13px] leading-snug text-text-secondary">{{ main }}</p>
      <p v-if="sub" class="text-xs leading-snug text-text-muted">{{ sub }}</p>
    </div>
  </div>
</template>
