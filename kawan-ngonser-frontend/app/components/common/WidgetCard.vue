<template>
  <section class="flex flex-col gap-3 rounded-2xl bg-surface p-4">
    <header class="flex items-center justify-between">
      <h2 class="font-heading text-base font-bold text-text"><slot name="title" /></h2>
      <slot name="header-extra" />
    </header>
    <div class="flex flex-col gap-2.5">
      <slot />
    </div>
  </section>
</template>
