/**
 * Built-in app-config defaults (§3.2 / N-2): a never-synced install must be
 * fully functional. Mirrors migrations/app_configs.json — keys and values must
 * stay aligned with the backend seed.
 */
import type { AppConfig } from '../types'

export const DEFAULT_APP_CONFIG: AppConfig = {
  defaultLeadTimeMin: 15,
  batteryLowThresholdPct: 20,
  notificationTemplates: [
    // C15 — performance pool
    { type: 'performance', title: '{artist} in {x} mins', body: 'Head to {stage} and grab your spot 🙌' },
    { type: 'performance', title: '{artist} is performing in {x} mins', body: 'Head to {stage} and prepare to enjoy' },
    { type: 'performance', title: '{artist} is up next!', body: '{stage}, {x} minutes — time to start moving.' },
    { type: 'performance', title: '{x} mins till {artist}', body: 'Front row won\'t wait — head to {stage}.' },
    { type: 'performance', title: 'Incoming: {artist} 🎤', body: 'Hitting {stage} in {x} mins. You know what to do.' },
    // C16 — custom-event pool
    { type: 'custom_event', title: '{event} in {x} mins', body: 'You planned this — don\'t bail on yourself.' },
    { type: 'custom_event', title: 'Time for {event}', body: '{x} minutes to go — squeeze it in before the next set.' },
    { type: 'custom_event', title: '{event} — {x} mins away', body: 'Future you says thanks.' },
  ],
  copyStrings: {
    // C11
    sync_banner: {
      text: 'Fresh concert data just dropped. Sync it?',
      confirm: 'Yes please',
      dismiss: 'I\'ll handle it myself',
    },
    // C12
    sync_overwrite_confirm: {
      text: 'Heads up — you\'ve edited this concert\'s data. Syncing replaces those edits with the server version (your picks and custom events are safe). Replace them?',
      confirm: 'Replace my edits',
      dismiss: 'Keep my edits',
    },
    // C13
    day_complete_banner: 'That\'s a wrap for today. See you on Day {x} — rest up! 🌙',
    // C14
    concert_complete_banner: 'That\'s a wrap. What a ride — get home safe, and keep the songs with you. 🎶',
  },
}
