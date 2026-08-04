<script setup lang="ts">
defineProps<{ rows?: number }>()
</script>

<template>
  <div class="flex flex-col gap-3">
    <div
      v-for="i in rows ?? 2"
      :key="i"
      class="flex items-center gap-3 rounded-2xl bg-surface p-3.5"
    >
      <USkeleton class="size-14 rounded-[14px]" />
      <div class="flex flex-1 flex-col gap-2">
        <USkeleton class="h-4 w-2/5" />
        <USkeleton class="h-3 w-3/5" />
      </div>
    </div>
  </div>
</template>
