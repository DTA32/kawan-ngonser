<script setup lang="ts">
// 40px circle: artist photo, initial-letter tile when missing/uncached
const props = defineProps<{
  name: string
  image?: string
  size?: 'md' | 'lg'
}>()

const failed = ref(false)
const initial = computed(() => props.name.trim().charAt(0).toUpperCase() || '?')
</script>

<template>
  <div
    class="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-raised"
    :class="size === 'lg' ? 'size-12' : 'size-10'"
  >
    <img
      v-if="image && !failed"
      :src="image"
      alt=""
      class="size-full object-cover"
      loading="lazy"
      @error="failed = true"
    >
    <span v-else class="font-heading font-bold text-text-secondary" :class="size === 'lg' ? 'text-lg' : 'text-base'">
      {{ initial }}
    </span>
  </div>
</template>
