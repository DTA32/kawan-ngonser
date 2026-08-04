<script setup lang="ts">
defineProps<{
  total: number
  /** Number of fully completed steps (bars filled with primary) */
  completed: number
}>()
</script>

<template>
  <div class="flex gap-1.5 px-5 py-1">
    <div
      v-for="i in total"
      :key="i"
      class="h-1 flex-1 rounded-sm"
      :class="i <= completed ? 'bg-primary' : 'bg-border'"
    />
  </div>
</template>
