/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string, revision: string | null }> }

const IMAGE_CACHE = 'kn-images-v1'

// App shell (TR-2): precache everything the build emits + SPA fallback.
// clientsClaim: control the page from the FIRST visit so the image route and
// offline shell work without a reload (updates still wait for the prompt).
clientsClaim()
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

const denylist = [/^\/api\//]
registerRoute(new NavigationRoute(
  async () => (await caches.match('/index.html')) ?? Response.error(),
  { denylist },
))

// Artist images / logos: cache-first against the warm-up cache populated by
// services/imageCache.ts at sync/upload time. No API GET caching (G-4).
self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.destination !== 'image') return
  event.respondWith((async () => {
    const cached = await caches.match(request, { cacheName: IMAGE_CACHE, ignoreVary: true })
    if (cached) return cached
    try {
      return await fetch(request)
    } catch {
      const placeholder = await caches.match('/icons/icon-192.png')
      return placeholder ?? Response.error()
    }
  })())
})

// N-1: tapping a notification focuses/opens the app at the concert-day home.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url: string = event.notification.data?.url ?? '/'
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = clients.find(c => 'focus' in c)
    if (existing) {
      await existing.focus()
      if ('navigate' in existing && existing.url !== url) await existing.navigate(url)
      return
    }
    await self.clients.openWindow(url)
  })())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
