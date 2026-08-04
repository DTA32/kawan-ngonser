/**
 * Boots the notification scheduler: snapshot from the stores (every planned
 * concert), ledger in local_kv, delivery via SW showNotification with
 * new Notification / in-app toast fallbacks, catch-up on visibilitychange.
 */
import { kvRepo } from '~/db/repos/kvRepo'
import { buildNotificationSchedule, type ScheduledNotification } from '~/domain/notifications'
import { buildEffectiveSchedule } from '~/domain/schedule'
import { createNotificationScheduler } from '~/services/notificationScheduler'
import { useAppConfigStore } from '~/stores/appConfig'
import { useConcertCacheStore } from '~/stores/concertCache'
import { usePlanStore } from '~/stores/plan'
import { persist } from '~/utils/persist-feedback'

const LEDGER_KEY = 'notification-ledger'

export default defineNuxtPlugin(() => {
  const cache = useConcertCacheStore()
  const planStore = usePlanStore()
  const appConfig = useAppConfigStore()
  const toast = useToast()

  const snapshot = computed(() => {
    const scheduled: ScheduledNotification[] = []
    for (const eventId of planStore.plannedEventIds) {
      const concert = cache.getConcert(eventId)
      const plan = planStore.getPlan(eventId)
      if (!concert || !plan) continue
      const schedule = buildEffectiveSchedule(concert, plan.overrides, plan.customEvents)
      scheduled.push(...buildNotificationSchedule({
        concert,
        schedule,
        picks: plan.picks,
        leadTimeMin: plan.settings.leadTimeOverrideMin ?? appConfig.config.defaultLeadTimeMin,
      }))
    }
    return {
      scheduled: scheduled.sort((a, b) => a.fireAtMs - b.fireAtMs),
      templates: appConfig.config.notificationTemplates,
    }
  })

  async function deliver(n: ScheduledNotification, rendered: { title: string, body: string }) {
    const canNotify = 'Notification' in window && Notification.permission === 'granted'
    if (canNotify) {
      try {
        const reg = await navigator.serviceWorker?.getRegistration()
        if (reg) {
          await reg.showNotification(rendered.title, {
            body: rendered.body,
            tag: n.id,
            icon: '/icons/icon-192.png',
            data: { url: '/' },
          })
          return
        }
        // No SW registration (e.g. dev) — page-scoped notification
        void new Notification(rendered.title, { body: rendered.body, tag: n.id })
        return
      }
      catch {
        // fall through to the in-app toast
      }
    }
    toast.add({
      title: rendered.title,
      description: rendered.body,
      icon: 'i-lucide-bell-ring',
      color: 'primary',
    })
  }

  const scheduler = createNotificationScheduler({
    getSnapshot: () => snapshot.value,
    loadLedger: async () => (await kvRepo.get<string[]>(LEDGER_KEY)) ?? [],
    saveLedger: ids => persist(() => kvRepo.set(LEDGER_KEY, ids)),
    deliver,
    now: () => nowMs(),
    random: () => Math.random(),
  })

  // Boot after hydration (db.client.ts runs first — plugin order by filename)
  void scheduler.init()

  // Any plan/config change → re-check + re-arm
  watch(snapshot, () => scheduler.check(), { deep: false })

  // Catch-up when the tab/PWA becomes visible again (throttled timers)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduler.check()
  })
})
