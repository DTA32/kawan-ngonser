export default defineNuxtConfig({
  ssr: false,

  modules: ['@nuxt/ui', '@nuxt/fonts', '@pinia/nuxt', '@vueuse/nuxt', '@vite-pwa/nuxt'],

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    public: {
      // Baked at build time (static output) — set NUXT_PUBLIC_API_BASE
      apiBase: '',
    },
  },

  // G-5: three-state theme, dark fallback, class applied before paint
  colorMode: {
    preference: 'system',
    fallback: 'dark',
    classSuffix: '',
  },

  app: {
    head: {
      title: 'Kawan Ngonser',
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
      meta: [
        { name: 'theme-color', content: '#0F1017' },
      ],
    },
  },

  spaLoadingTemplate: true, // app/spa-loading-template.html

  pwa: {
    strategies: 'injectManifest',
    srcDir: 'service-worker',
    filename: 'sw.ts',
    registerType: 'prompt',
    manifest: {
      name: 'Kawan Ngonser',
      short_name: 'Kawan Ngonser',
      description: 'Plan the concert. Catch every set.',
      display: 'standalone',
      start_url: '/',
      theme_color: '#0F1017',
      background_color: '#0F1017',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    injectManifest: {
      globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
    },
    devOptions: {
      enabled: false,
      type: 'module',
    },
  },

  typescript: {
    strict: true,
  },

  compatibilityDate: '2026-08-04',
})
