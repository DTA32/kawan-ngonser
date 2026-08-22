<script setup lang="ts">
// The dashed-outline "Add a …" affordance repeated on every builder step.
defineProps<{ label: string }>()
</script>

<template>
  <button
    type="button"
    class="flex w-full items-center justify-center gap-2.5 rounded-[14px] px-3 py-3 text-sm font-semibold text-primary ring-[1.5px] ring-inset ring-border active:bg-primary/5"
  >
    <UIcon name="i-lucide-plus" class="size-[18px]" />
    {{ label }}
  </button>
</template>
