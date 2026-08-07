/**
 * Copy deck (REQUIREMENTS §11) — strings are used VERBATIM. 🛰-marked strings
 * (C11–C16) resolve through the app-config store with the constants in
 * domain/config/defaults.ts as fallbacks; everything here is hardcoded.
 *
 * The DESIGN section collects design.pen microcopy that is not in the deck —
 * flagged as new copy pending a future deck revision.
 */

/** "{artist} is up next" style interpolation. */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) =>
    key in vars ? String(vars[key]) : m)
}

export const COPY = {
  // C1
  welcomeHeadline: 'Plan the concert. Catch every set.',
  welcomeSub: 'Pick your must-see artists, settle the clashes, and get a nudge before every performance — even with no signal.',
  // C2
  installReminder: 'Best enjoyed installed — add it to your home screen and it keeps working with no signal.',
  // C3
  offlineTitle: 'Offline',
  offlineBody: 'You are currently offline',
  // C4
  onlineTitle: 'Online',
  onlineBody: 'You can download or sync latest concert data',
  // C5 ({n})
  batteryToastOnline: 'Battery\'s at {n}% — switch to airplane mode, your plan works offline anyway.',
  // C6 ({n})
  batteryToastOffline: 'Battery\'s at {n}% — time to hunt down a charging station or rent a powerbank.',
  // C7
  planCta: 'Plan for this concert',
  // C8
  conflictSheetTitle: 'Schedule clash! Who gets you?',
  // C9
  allSetOngoing: 'All set! The party\'s already on — go find your first stage. 🎶',
  // C10 ({concert}; countdown rendered separately)
  allSetUpcoming: 'All set! {concert} kicks off in',
  // C17
  skipAction: 'Skip this one',
  // C18
  makePickAction: 'Make this my pick',
  // C19
  notifyOptInAction: 'Notify me for this too',
  // C20
  editAction: 'Schedule changed? Edit this set',
  // C21
  watchThisAction: 'Watch this',
  // C22 ({x})
  peekDayAction: 'Peek at Day {x}',
  // C23
  notifyOptOutAction: 'Stop notifying',
  // C24
  themeTitle: 'Theme',
  themeSystem: 'System',
  themeLight: 'Light',
  themeDark: 'Dark',
  // C25 ({concert})
  uploadSuccess: '{concert} loaded — all set to plan. 🎫',
  // C26
  uploadFailure: 'That file doesn\'t look like concert data — check the JSON and try again.',
  // C27 ({n})
  syncSuccess: 'Synced to v{n} — your plan survived the update. ✨',
  // C28
  syncFailure: 'Sync didn\'t go through — keeping your current data for now.',
  // C29 — performance-action toasts
  toastSkipped: 'Skipped — {artist} is off your list.',
  toastPickSwap: '{artist} is your pick — {other} goes to the backburner.',
  toastNotifyOptIn: 'We\'ll nudge you before {artist} too.',
  toastNotifyOptOut: 'Okay — no nudges for {artist}.',
  toastPromoted: '{artist} moved up from the backburner.',
  toastWatchThis: 'Added — {artist} is on your list.',
  toastEditSaved: 'Set updated — the new times are on your timetable.',
  toastRemoved: '{artist} removed from your timetable.',
  // C30 — settings-saved toasts
  toastWidgetOrderSaved: 'Widget order saved.',
  toastLeadTimeSaved: 'Lead time set to {n} min — future nudges follow it.',
  toastConflictDisplaySaved: 'Conflict display updated — the timetable follows suit.',
  // C31
  toastSaveFailure: 'Hmm, that didn\'t save. Give it another go?',
} as const

/** design.pen microcopy NOT in the copy deck — new copy pending sign-off. */
export const DESIGN_COPY = {
  daySelectTitle: 'Which days are you going?',
  daySelectSub: 'Pick any or all — you can change this later.',
  artistSelectTitle: 'Who do you have to see?',
  artistSelectSub: 'Tap everyone you don\'t want to miss — clashes get sorted next.',
  conflictHint: 'Tap your pick — the other stays on the backburner.',
  continueCta: 'Continue',
  nextDayCta: 'Next: Day {x}',
  finishCta: 'Finish',
  allSetTitle: 'All set!',
  takeMeHomeCta: 'Take me home',
  widgetUpNext: 'Up next',
  widgetTimetable: 'Timetable',
  widgetBackburner: 'On the backburner',
  widgetOther: 'Everything else',
  widgetNextDays: 'Your next days',
  pastCollapse: 'Earlier today · {n} sets played',
  liveBadge: 'LIVE',
  // G-2 third state — measured round trips, not navigator.onLine (new copy)
  onlineSlowTitle: 'Online (slow)',
  onlineSlowBody: 'Your connection is sluggish — syncing may take a while.',
  expandToEndOfDay: 'Show until end of day',
  showMore: 'Show {n} more · {remaining} left',
  addBreak: 'Add a break',
  emptySlot: 'Free · add something here',
  // W-2 view toggle (new copy)
  timetableViewCompact: 'Compact view',
  timetableViewDetailed: 'Detailed view',
  jumpToNow: 'Jump to now',
  liveBanner: 'Day {x} is happening now',
  liveBannerOpen: 'Open',
  previewingDay: 'Previewing Day {x} · {date}',
  // Empty states
  emptyPlanned: 'Nothing planned yet — pick a concert below.',
  emptyAvailableOffline: 'You\'re offline — new concerts appear when you\'re back.',
  emptyAvailableOfflineSub: 'Saved plans and JSON upload still work.',
  emptyAvailableNone: 'Nothing new to plan right now.',
  emptyAvailableNoneSub: 'New concerts show up here — JSON upload works too.',
  emptyPast: 'No past concerts yet.',
  emptyUpNext: 'No more sets today.',
  emptyUpNextSub: 'See you on Day {x} 🌙',
  emptyBackburner: 'No clashes left — every set has your full attention.',
  emptyOther: 'Nothing else today — you picked them all.',
  // Backburner-notify default (O-2 step + S-3 sheet, new copy)
  backburnerNotifyLabel: 'Also notify me for backburner sets',
  backburnerNotifySub: 'Nudges for clash runner-ups too — you can still mute them one by one.',
  // Planned-concert detail sheet (new copy)
  downloadFailure: 'Couldn\'t download the concert — check your signal and try again.',
  yourDaysLabel: 'Your days',
  dayPreviewSub: '{n} picks · tap to preview',
  editPlanCta: 'Edit your plan',
  // S-5 confirm (new copy)
  cancelPlanTitle: 'Cancel this concert plan?',
  cancelPlanBody: 'Your picks, custom events, and edits for {concert} will be deleted from this device. The concert stays available to plan again.',
  cancelPlanConfirm: 'Cancel plan',
  cancelPlanKeep: 'Keep my plan',
} as const
