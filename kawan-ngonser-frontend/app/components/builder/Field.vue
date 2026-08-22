<script setup lang="ts">
/**
 * The builder input: uppercase label + boxed control with a leading icon
 * (design component "Builder Field"). The control itself is a slot so text,
 * date, time and select inputs all share one shell.
 */
defineProps<{
  label: string
  icon: string
}>()
</script>

<template>
  <label class="flex min-w-0 flex-col gap-1.5">
    <span class="text-[11px] font-semibold uppercase tracking-[1px] text-text-muted">{{ label }}</span>
    <span class="flex items-center gap-2 rounded-xl bg-surface px-3.5 py-3 ring-1 ring-inset ring-border focus-within:ring-primary">
      <UIcon :name="icon" class="size-4 shrink-0 text-text-secondary" />
      <slot />
    </span>
  </label>
</template>
