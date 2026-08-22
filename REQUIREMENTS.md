# Kawan Ngonser — Festival Planner PWA Requirements

> **Status:** v8
>
> **v7** plus the **Concert Builder** (§13): a user can author a whole concert schedule on-device and export it as JSON for other people to plan against. Adds the `local_concert_builds` store (§3.5), TR-7, the H-6 Home entry, the H-5 "Edit a copy" remix action, and §11.2 copy.
>
> **First real-world use:** Sounds Project music festival, weekend of 2026-08-08/09. The app itself is generic — any festival/concert that follows the data schema should work.

## 1. Overview

**Kawan Ngonser** ("concert buddy") is an **offline-first PWA** that helps a festival-goer plan which artists to watch across a multi-day, multi-stage music festival.

Core problems it solves:

- Artists perform back-to-back and sometimes **at the same time on different stages** — the user needs to pick one and keep track of the choice.
- Stages are spread across the venue — the user needs to know **where to head next**.
- The user wants to be **notified a few minutes before** each performance they plan to watch.
- Venue signal reception is poor — **everything must work offline** once data is on the device.

Feature highlights:

- **Guided planning:** pick your attendance days and must-see artists per day; overlapping picks are settled through a quick head-to-head flow (preferred vs. backburner).
- **Day-of dashboard:** on concert day the home screen becomes a personalizable widget board — upcoming performances, a stage-colored timetable, backburner and unselected performances, and previews of your next days.
- **A timetable that adapts:** starts at the current time, expands into the past or the rest of the day, renders conflicts per your display preference, and accepts custom events (lunch, toilet break) alongside performances.
- **Local notifications:** a heads-up a configurable number of minutes before every performance you plan to watch (and custom events) — scheduled on-device so they fire with zero signal.
- **Offline-first by design:** concert data comes from the server or a manual JSON upload; after that, everything works offline. Connectivity and low-battery indicators keep you informed at a glance.
- **Schedule-change friendly:** performances can be edited locally (time changed, or removed when a performer cancels), and server updates sync without destroying your plan.
- **Build your own:** no data for your festival? Author the entire schedule inside the app (§13) — days, stages, sets — keep it on your device, and export it as a JSON file so friends can plan against the same lineup.

---

## 2. Technical Requirements

| ID | Requirement |
|----|-------------|
| TR-1 | Frontend is a **Nuxt** (Vue 3) app built as an installable **PWA** with a service worker. |
| TR-2 | **Offline-first:** once concert data is on the device (synced or uploaded), every feature except server sync must work with zero connectivity. Offline is the *expected* condition at the venue, not an edge case. |
| TR-3 | Backend is a **simple Express.js server with MongoDB**. It serves: (a) the list of available concerts, (b) full concert data per concert, (c) a **lightweight version-check endpoint** — returns only the current data version of a concert, so the F-1 update check doesn't download the full payload, (d) app configs (notification copy templates, default settings). Draft API sketch: `GET /concerts`, `GET /concerts/:id`, `GET /concerts/:id/version`, `GET /config`. |
| TR-4 | **No accounts / no auth.** All user data (plans, preferences, conflict resolutions, custom events, widget order) is stored **locally on-device** (e.g., IndexedDB). The backend holds no user state. |
| TR-5 | Concert data carries a **version** so the client can detect when the server has newer data (see F-1 sync advisory). |
| TR-6 | Concert data can alternatively be **uploaded manually as a JSON file** (same schema as the server serves). This must work fully offline. |
| TR-7 | **Concert Builder (§13):** the user can author concert data on-device. Builds are stored **locally only** (`local_concert_builds`, §3.5) — the backend never learns they exist, so TR-4 still holds — and are shared by **exporting JSON in the §3.1 wire shape**, which any other device imports through the TR-6 upload path with no Builder-specific handling. Fully offline, end to end. |

---

## 3. Data

### 3.1 Concert data (finalized wire schema)

```jsonc
{
  "id": "sounds-project-2026",
  "version": 3,                    // bumped on every change, used for sync detection
  "name": "The Sounds Project",
  "logo": "<url or embedded asset>",
  "place": "…venue name…",
  "description": "…",
  "timezone": "Asia/Jakarta",      // all times are venue-local
  "days": [
    { "index": 1, "date": "2026-08-08" },
    { "index": 2, "date": "2026-08-09" }
  ],
  "stages": [
    { "id": "main", "name": "Main Stage", "color": "#E85D75" }
  ],
  "performances": [
    {
      "id": "perf-001",
      "artistName": "…",
      "artistImage": "<url>",
      "dayIndex": 1,
      "stageId": "main",
      "start": "2026-08-08T19:00:00",
      "end": "2026-08-08T20:00:00"
    }
  ]
}
```

Notes:
- **Finalized contract:** the API serves exactly this camelCase shape; `start`/`end` are **naive venue-local wall-time strings** (no offset), interpreted in `timezone`. The client's normalizer additionally tolerates the snake_case Mongo seed shape (`migrations/*.json`, incl. `{$date}` wrappers) for manual uploads, plus offset/UTC timestamp forms.
- A concert may span **multiple days**. Sets may spill past midnight (e.g. 23:15–00:15) and stay on their `dayIndex`.
- Artist images must be cached for offline use (they appear in the conflict-resolution UI). ⚠️ They are cross-origin opaque responses with heavy quota padding, so the client caps warm-up to preserve storage headroom and treats the image cache as evictable: if a plan write ever hits a quota error, the image cache is dropped and the write retried — plan data always wins over photos.

### 3.2 App config (served by backend, cached locally with built-in fallbacks)

- Notification copy template **pools** with placeholders — multiple variants per type (performance / custom event), one picked at random for each notification fired (C15, C16).
- Default notification lead time: **15 minutes**.
- Battery "low" threshold — defaults to **20%** (G-3).
- Other copy that may need tweaking without redeploys (e.g., end-of-concert warm message). See §11 Copy Deck.

### 3.3 Local user data (per planned concert)

- Selected attendance day(s)
- Selected artists per day
- Conflict resolutions: which performance is **preferred** vs **backburner** (least preferred)
- Conflict display preference (see O-2)
- **Backburner notification default** (O-2/S-3 checkbox): when on, performances that become backburner default to notifying — N-1c flips from opt-in to opt-out; per-performance C19/C23 still overrides
- Custom events (name + time)
- Local **edits (overrides) to performance data** made via the performance sheet (W-2) — flagged, so sync can warn before replacing them
- Per-performance **notification opt-ins** for backburner performances (N-1)
- Widget order for the concert-day home
- Notification lead-time override
- The downloaded/uploaded concert data itself + its version

### 3.4 Local user data (app-wide, not per concert)

- Theme choice: **system / light / dark** (G-5)

### 3.5 Local concert builds (Concert Builder, §13)

One row per authored concert in `local_concert_builds`. The row **mirrors the Mongo `concerts` document** (§3.1 / `mongodb.mermaid`) — a build is simply a concert document the user happens to own — plus four local-only bookkeeping fields:

```jsonc
{
  "build_id": "build-8f2a91c4",        // local PK: survives event_id edits and forks
  "event_id": "my-festival-2026-a4f9", // business id that ships in the export (B-11)
  "version": 7,                        // bumped on every saved change (TR-5 semantics)
  "name": "…",
  "logo": "<url>",
  "place": "…",
  "description": "…",
  "timezone": "Asia/Jakarta",
  "days":         [{ "day_index": 1, "date": "2026-08-08" }],
  "stages":       [{ "stage_id": "main", "name": "Main Stage", "color": "#E85D75" }],
  "performances": [{
    "performance_id": "perf-001",
    "artist_name": "…",
    "artist_image": "<url>",
    "day_index": 1,
    "stage_id": "main",
    "start_time": "2026-08-08T19:00:00",  // naive venue-local, as in §3.1
    "end_time":   "2026-08-08T20:00:00"
  }],
  "origin": "scratch",                 // scratch | forked (B-15)
  "forked_from_event_id": null,
  "created_at": 1755820800000,
  "updated_at": 1755907200000
}
```

Notes:
- Rows are stored in the **snake_case Mongo shape**, consistent with every other local table (each mirrors its server counterpart); the repo maps to the canonical camelCase domain types exactly like the other repos do.
- **Export (B-13) emits the §3.1 camelCase wire shape, not this row shape.** The file must be indistinguishable from a `GET /concerts/:id` response so the H-3 upload path needs no special case.
- Builds are **not** concert cache entries. They never appear in the H-2 lists (a) – (c), they may be incomplete, and editing one never mutates a concert already planned from it (B-12).
- **No plan data lives here.** Picks, conflict resolutions, custom events, overrides, and preferences belong to `local_plans` (§3.3) and are never exported.

---

## 4. Global UI Elements

| ID | Requirement |
|----|-------------|
| G-1 | **Install reminder:** while the app is not installed as a PWA, a component at the bottom of the page (in normal content flow — **not** sticky/fixed) reminds the user to install (C2). Always shown until installed. |
| G-2 | **Connectivity indicator:** a globe icon at the top right — **greyed when offline, colored when online**. Tapping it shows a tooltip: offline → title "Offline", body "You are currently offline" (C3); online → title "Online", body "You can download or sync latest concert data" (C4). **Third state (post-day-1 feedback):** `navigator.onLine` only reports that an interface exists, so at a venue it reads "Online" on a connection that carries nothing. Connection quality is therefore **measured** — every API call is timed, and a `GET /health` probe fills the gaps only when the app has gone quiet (visible tab, browser online, no sample for 60s). A sustained slow round trip shows an **amber** globe with title "Online (slow)"; repeated unreachability falls back to the offline presentation even while the browser claims to be online. Hysteresis (two consecutive samples) prevents flicker. ⚠️ `navigator.connection`/`effectiveType` is Chromium-only (unavailable on iOS Safari) — used as a bonus signal only, never the primary one. |
| G-3 | **Battery indicator:** when battery is low (**≤20% by default; threshold served via app config**), a battery icon appears beside the globe. On crossing the threshold: if **online**, show a toast advising to switch to airplane/offline mode (save battery); if **offline**, show a toast advising to find a charging station or rent a powerbank. ⚠️ Constraint: the Battery Status API is Chromium-only (unavailable on iOS Safari) — the feature must degrade gracefully (icon/toast simply never appear). |
| G-4 | **Offline states, never errors:** any view that needs the network shows a friendly offline state instead of an error. Actions that work offline (e.g., JSON upload) remain available in that state. |
| G-5 | **Theme toggle:** a sun/moon icon beside the connectivity indicator (G-2). Tapping it opens a small popover (same interaction pattern as the globe tooltip) with three options (C24): **System** (default), **Light**, **Dark**. Behavior: **(a)** the choice is an **app-wide setting**, persisted locally (§3.4); **(b)** "System" follows the OS color-scheme preference and falls back to **dark** when no preference is detectable (§12); **(c)** the active theme is applied **before first paint** — no flash of the wrong theme on load — and switching is instant, no reload; **(d)** the PWA `theme-color` (status/title bar tint) follows the active theme; **(e)** stage colors are data-driven and identical in both themes — only app chrome changes (§12.4 contrast rules apply in both). |

---

## 5. Home (default)

| ID | Requirement |
|----|-------------|
| H-1 | **First visit:** welcome text + a few sentences explaining what the app does (C1). |
| H-2 | Below the welcome, concert lists in this order: **(a) upcoming planned concerts**, **(b) available concerts to plan** (fetched from server), **(c) past planned concerts**, **(d) your builds** (§13, B-2 — concerts you authored; the section is omitted entirely when you have none). |
| H-3 | The user can **upload a concert JSON file** as an alternative to picking from the server list. Available at all times, including offline. |
| H-4 | When offline, list (b) is replaced by an **offline state** (per G-4); manual upload stays available. When online but the server has nothing new to plan (empty list, or everything already planned), list (b) shows an **empty state** instead of collapsing silently. |
| H-5 | Tapping a concert opens a **detail sheet** (bottom sheet) with three variants: **(a) unplanned** — logo, name, date(s), place, description, CTA **"Plan for this concert"** → downloads the full payload (server concerts), then navigates to onboarding; **(b) planned, upcoming** — a **"Your days"** list (attending days with pick counts, tap to preview that day's board) plus an **"Edit your plan"** button that re-enters onboarding with all answers pre-filled; **(c) planned, past** — the "Your days" preview list only (relive the days; no editing). All three variants also carry **"Edit a copy"** (C38): it forks the concert data into the Concert Builder under a fresh `event_id` (B-15), leaving the original entry and any plan on it untouched. |
| H-6 | **Build a concert:** beside the upload card (H-3), a **"Build a concert"** card (C32) opens the Concert Builder (§13). Available at all times, including offline. |

---

## 6. Onboarding Flow

> **Conflict definition (applies app-wide):** two performances conflict when their time ranges **overlap by any amount** — even a single minute.

Steps run in this order. All answers are persisted locally (TR-4).

| ID | Requirement |
|----|-------------|
| O-1 | **Day selection** (only if the concert spans multiple days): the user picks which day(s) they will attend — any subset, from one day up to all days. |
| O-2 | **Conflict display preference:** how the *less-preferred* entry of a time conflict is rendered in the timetable. Options: **(a)** equal size (50/50, 33/33/33, …), **(b)** hidden entirely. This is a **concert-wide personal setting** — one choice per planned concert (applies to every attending day), stored locally, changeable later in settings (S-3). The step also carries a checkbox — **"Also notify me for backburner sets"** (default off) — setting the concert's backburner notification default (see N-1, §3.3). |
| O-3 | **Artist selection:** checkbox list of that day's artists + a proceed button. Repeated **once per selected day** until all days are done. |
| O-4 | **Conflict resolution:** if selected artists have overlapping performance times, a **"Schedule clash! Who gets you?"** bottom sheet (C8) appears **after each day's artist-selection step**, before moving to the next day — side-by-side cards showing artist picture + name; the user taps their preferred one, the other(s) become *backburner*. Repeats until all conflicts are resolved. |
| O-5 | **Finish — "All set!"** with context-dependent copy: concert already ongoing → "All set! The party's already on — go find your first stage. 🎶" (C9); concert starts later → "All set! {concert} kicks off in {x}d {x}h {x}m." with a live countdown (C10). |

---

## 7. Concert-Day Home

On a day the user attends, the homepage is **entirely different**: a widget dashboard the user can personalize.

### 7.1 Fixed widgets (always at the top, not rearrangeable)

| ID | Requirement |
|----|-------------|
| F-1 | **Sync advisory:** shown when online **and** the server has a newer concert-data version. Copy (C11): "Fresh concert data just dropped. Sync it?" with buttons **"Yes please"** and **"I'll handle it myself"**. If the user has made local edits to the concert data (via the performance-sheet edit affordance, W-2), an extra confirmation dialog appears first (C12): "Heads up — you've edited this concert's data. Syncing replaces those edits with the server version (your picks and custom events are safe). Replace them?" with buttons **"Replace my edits"** / **"Keep my edits"**. **Sync semantics:** syncing replaces the **concert data only — including any local performance edits**. The user's plan (day/artist selections, conflict resolutions, custom events, preferences) is preserved and **re-validated** against the new data: performances that no longer exist are dropped from the plan; changed times re-trigger conflict detection where needed. |
| F-2 | **Day-complete banner:** when all of today's chosen performances are done — if more attending days remain: "That's a wrap for today. See you on Day {x} — rest up! 🌙" (C13) plus a **"Peek at Day {x}"** button (C22) that opens that day's home preview (same behavior as W-5); if it's the last (or only) day: "That's a wrap. What a ride — get home safe, and keep the songs with you. 🎶" (C14). All copy configurable via app config. |

### 7.2 Rearrangeable widgets

| ID | Widget | Requirement |
|----|--------|-------------|
| W-1 | **Upcoming performances** | The next performance as a large card — artist name, time (with relative "in xx mins"), stage — followed by the two performances after it as smaller cards with the same content. A performance stays listed until it **ends**, not until it starts: a set already under way is still catchable, and shows a **LIVE** marker and a countdown to its end instead of to its start. |
| W-2 | **Timetable** | See detailed spec below. |
| W-3 | **"Backburner" performances** | Lists all in-progress and upcoming *least-preferred* (conflict-losing) performances (same end-based rule as W-1). Tapping one opens the same sheet as the timetable entry sheet. |
| W-4 | **Other performances** | Lists all in-progress and upcoming performances the user did **not** select at all (same end-based rule as W-1 — a set that is currently playing must stay re-addable). Tapping one opens a similar sheet with a **"Watch this"** (C21) button to add it to the plan. If the added performance overlaps an existing pick, the conflict-resolution flow (O-4 sheet) triggers. The list is **paginated**: 5 cards, then a "Show 5 more · {n} left" control. |
| W-5 | **Next days** | Only shown if the user attends further days. Lists those days; tapping one opens a **preview of that day's home** so the plan can be re-adjusted in advance. |

#### W-2 Timetable — detailed spec

- Starts at the **current time**; previous hours are collapsed but can be **expanded** to see past performances (and collapsed again).
- Shows the next few hours; **expandable** to the end of the day's performances, and collapsible back.
- Entries are **colored by stage**.
- Conflicting entries are rendered according to the conflict display preference (O-2).
- A **now-line** (today only) marks the current time. Because it must answer "is this set already going?", it **overlays the cluster that is currently playing**, positioned at the elapsed fraction of that cluster's span, and only falls back to a plain divider between entries when nothing is playing. In compact view the position is indicative rather than to scale (rows are uniform-height); in detailed view it is minute-accurate. Where the line would collide with a row's own time label, that label is suppressed.
- Two **view modes**, toggled from the widget header and remembered per concert (defaults to compact):
  - **Compact** — the cluster-row layout above: uniform-height rows, overlaps split equally.
  - **Detailed** — a minute-proportional day canvas with an hour axis, block heights that match real durations, and side-by-side lanes so a *partial* clash reads as partial. Scrolls inside the widget, opens on the current time. Tapping empty canvas creates a custom event at that time. Same content as compact (preferred + backburner per O-2 + custom events).
- Tapping a performance opens a **bottom sheet**: artist photo, artist name, time (relative first, then exact), stage. Actions:
  - **"Skip this one"** (C17) — cancel watching this performance.
  - If the tapped performance is the backburner one of a conflict: **"Make this my pick"** (C18) — swaps preferred ↔ backburner — and **"Notify me for this too"** (C19) — opts this backburner performance into notifications (N-1). Once opted in, the button flips to **"Stop notifying"** (C23).
  - **"Schedule changed? Edit this set"** (C20) — edit affordance for when the real-world schedule shifts: the user can **change the performance's time** or **remove it entirely** (e.g., the performer cancelled). Edits and removals are stored as **local overrides to the concert data** and flagged, so the F-1 sync confirmation warns before the server version replaces them.
  - Removing or skipping a **preferred** performance automatically **promotes its backburner counterpart**, if any.
- Tapping an empty slot (or a **+** button) creates a **custom event** with a user-defined name and time — e.g., toilet break, lunch/dinner. Custom events appear in the timetable and can be **edited or deleted** after creation via a similar sheet.

### 7.3 Settings

Listed in recommended display order: frequently used, harmless items first; the destructive action last.

| ID | Requirement |
|----|-------------|
| S-1 | Rearrange the widgets of §7.2. |
| S-2 | Notification lead time — defaults to the app-config value (15 min), user-overridable. |
| S-3 | "Change conflict display preference" (O-2). The sheet also hosts the backburner-notify default checkbox; toggling it re-applies to existing backburner picks (per-set C19/C23 choices can then override again). |
| S-4 | "See other concerts" (back to the default home). |
| S-5 | "Cancel this concert plan" — destructive: keep it last, visually distinct, and behind a confirmation dialog. |

---

## 8. Notifications

| ID | Requirement |
|----|-------------|
| N-1 | A notification fires **[lead time] minutes before**: **(a)** each **preferred** performance the user plans to watch — "{artist} is performing in x mins" + "Head to {stage} and prepare to enjoy"; **(b)** each **custom event** the user created; **(c)** any **backburner** performance the user explicitly opted into via its sheet's "Also notify this performance" button. Backburner performances are silent by default — unless the concert's **backburner notification default** (O-2/S-3 checkbox) is on, which flips N-1c to opt-out: newly demoted performances notify, and C23 "Stop notifying" mutes them individually. |
| N-2 | Notification copy is **templated via app config** from the database (TR-3), with sane built-in defaults for when the config was never synced. Templates come in **pools** — one variant is picked at random for each notification fired (C15/C16). |
| N-3 | Lead time defaults to **15 minutes**; configurable in settings (S-2). |
| N-4 | Notifications must fire **while offline** → they are scheduled locally on-device, not pushed from the server. |

---

## 9. Open Questions / Assumptions to Confirm

None right now — all raised questions have been settled.

### Resolved decisions

- **App name** → **Kawan Ngonser**.
- **Conflict definition** → any overlap counts, even one minute (§6).
- **O-4 timing** → conflict resolution runs after each day's artist-picking step, before the next day.
- **Conflict display preference** → concert-wide personal setting, one choice per planned concert; two options only — equal size or hidden ("shown smaller" was dropped) (O-2).
- **Editable performance fields** → time change + full removal only; no artist name/image editing (W-2).
- **Notification scope** → preferred + custom events, plus per-performance opt-in for backburner with a "Stop notifying" opt-out (N-1).
- **Sync semantics** → concert data (incl. local performance edits) replaced; plan preserved and re-validated (F-1).
- **Battery threshold** → 20% default, served via app config (G-3).
- **Version check** → dedicated lightweight endpoint, no full-payload download (TR-3).
- **Settings order** → usage-frequency first, destructive last (§7.3).
- **Copy** → finalized in §11; notification copy uses randomized template pools (C15/C16); C22 "Peek at Day {x}" approved.
- **Custom events** → editable and deletable after creation, via a similar sheet (W-2).
- **Backburner promotion** → removing or skipping a preferred performance auto-promotes its backburner counterpart (W-2).
- **W-4 conflict trigger** → "Watch this" runs the O-4 conflict flow when the added performance overlaps an existing pick.
- **Theme** → "Night Stage" palette (§12), dark by default; three-state System/Light/Dark toggle in the header, app-wide and persisted locally (G-5).

### Implementation-phase decisions (v7)

- **Wire contract finalized** → §3.1 camelCase with naive venue-local wall times; snake_case seed shape tolerated on upload. `GET /config` 404s when unseeded → client built-in defaults (N-2). `GET /concerts` summaries omit `timezone` (dates are date-only; client falls back to UTC for labels).
- **Backburner notify default** → per-concert checkbox in O-2 + S-3; default off (N-1 stays opt-in unless flipped).
- **Planned-concert detail sheet** → day-preview rows + "Edit your plan" (upcoming) / preview-only (past) (H-5).
- **W-4 pagination** → 5 cards + "Show more".
- **Storage-quota protection** → image cache is the evictable tier; plan writes retry after dropping it (§3.1).
- **Sync edge interpretations** (implemented, pending product nod): a backburner whose conflict dissolves after sync is auto-promoted; attending days that vanish are clamped out; skipped picks stay skipped while their performance survives.

### Concert Builder decisions (v8)

- **Build storage** → a dedicated `local_concert_builds` store (§3.5), *not* the concert cache. Half-finished builds must never surface as plannable concerts, and editing a build must never mutate a concert already planned from it (B-12).
- **Row shape** → snake_case Mongo `concerts` shape, matching the rest of the local schema; the **export** is the §3.1 camelCase wire shape so it round-trips through H-3 untouched (B-13).
- **Sharing scope** → concert data only. Picks, custom events, overrides, and preferences are never written to the export — §10 "sharing plans" stays out of scope.
- **Reuse means remix** → a received (or server) concert can be forked back into the Builder via "Edit a copy" (B-15), always under a new `event_id`, so nothing diverges silently.
- **Flow shape** → the Builder is **non-linear** (jump between steps, leave any time, autosave), unlike the linear onboarding flow (§6). Authoring is iterative; planning is not (B-3, B-9).
- **Overlaps** → cross-stage overlaps are legitimate content (they are what the app exists to resolve) and are never flagged; a **same-stage** overlap is a data error and is warned about (B-7).
- **Re-import** → an uploaded file that is a newer `version` of an already-planned concert runs the F-1 plan re-validation instead of overwriting blindly (B-14). ⚠️ Behavior change to the current upload path.

## 10. Out of Scope (for now)

- User accounts / authentication / cross-device sync
- Sharing **plans** with friends — the Concert Builder (§13) shares *concert data* only; picks, conflict resolutions, custom events, overrides, and preferences never leave the device
- Venue maps / navigation

---

## 11. Copy Deck (settled)

The agreed wording for all user-facing strings — implementers should use these verbatim. Strings marked 🛰 are served via app config (§3.2) so they can be tweaked without redeploying. Notification copy (C15, C16) is a **randomized pool**: one template is picked at random for every notification fired.

| # | Where | Copy |
|---|-------|------|
| C1 | Welcome headline + sub (H-1) | "Plan the concert. Catch every set." / "Pick your must-see artists, settle the clashes, and get a nudge before every performance — even with no signal." |
| C2 | Install reminder (G-1) | "Best enjoyed installed — add it to your home screen and it keeps working with no signal." |
| C3 | Globe tooltip, offline (G-2) | "Offline" / "You are currently offline" |
| C4 | Globe tooltip, online (G-2) | "Online" / "You can download or sync latest concert data" |
| C5 | Battery toast, online (G-3) | "Battery's at {n}% — switch to airplane mode, your plan works offline anyway." |
| C6 | Battery toast, offline (G-3) | "Battery's at {n}% — time to hunt down a charging station or rent a powerbank." |
| C7 | Concert sheet CTA (H-5) | "Plan for this concert" |
| C8 | Conflict sheet title (O-4) | "Schedule clash! Who gets you?" |
| C9 | Onboarding finish, ongoing (O-5) | "All set! The party's already on — go find your first stage. 🎶" |
| C10 | Onboarding finish, upcoming (O-5) | "All set! {concert} kicks off in {x}d {x}h {x}m." |
| C11 | Sync banner (F-1) 🛰 | "Fresh concert data just dropped. Sync it?" — "Yes please" / "I'll handle it myself" |
| C12 | Sync overwrite confirm (F-1) 🛰 | "Heads up — you've edited this concert's data. Syncing replaces those edits with the server version (your picks and custom events are safe). Replace them?" — "Replace my edits" / "Keep my edits" |
| C13 | Day-complete banner (F-2) 🛰 | "That's a wrap for today. See you on Day {x} — rest up! 🌙" |
| C14 | Concert-complete banner (F-2) 🛰 | "That's a wrap. What a ride — get home safe, and keep the songs with you. 🎶" |
| C15 | Notification, performance (N-1) 🛰 | Randomized pool — see below |
| C16 | Notification, custom event (N-1) 🛰 | Randomized pool — see below |
| C17 | Sheet: cancel watching (W-2) | "Skip this one" |
| C18 | Sheet: swap preference (W-2) | "Make this my pick" |
| C19 | Sheet: backburner notify opt-in (W-2) | "Notify me for this too" |
| C20 | Sheet: edit affordance (W-2) | "Schedule changed? Edit this set" |
| C21 | Other performances: add (W-4) | "Watch this" |
| C22 | Day-complete banner button (F-2) | "Peek at Day {x}" |
| C23 | Sheet: backburner notify opt-out (W-2) | "Stop notifying" |
| C24 | Theme popover (G-5) | Title "Theme" — options "System" / "Light" / "Dark" |
| C25 | Toast: JSON upload success (H-3) | "{concert} loaded — all set to plan. 🎫" |
| C26 | Toast: JSON upload failure (H-3) | "That file doesn't look like concert data — check the JSON and try again." |
| C27 | Toast: sync success (F-1) | "Synced to v{n} — your plan survived the update. ✨" |
| C28 | Toast: sync failure (F-1) | "Sync didn't go through — keeping your current data for now." |
| C29 | Toast: performance-action confirmations (W-2 / W-4) | Per-action — see below |
| C30 | Toast: settings saved (S-1 / S-2 / S-3) | Per-setting — see below |
| C31 | Toast: local save failure (any local write) | "Hmm, that didn't save. Give it another go?" |
| C32 | Home builder card (H-6) | "Build a concert" / "Make your own schedule — works offline" |
| C33 | Home builds section (B-2) | Section "Your builds" · row sub "{d} days · {n} sets · edited {when}" · status chips "Draft" / "Ready" |
| C34 | Builder step titles (B-3) | "Concert details" / "Days" / "Stages" / "Performances" |
| C35 | Builder readiness checklist (B-10) | "Almost there — {n} to go" · items see §11.2 |
| C36 | Builder: plan CTA (B-12) | "Plan this concert" — and the build stays editable |
| C37 | Export sheet (B-13) | "Share this concert" / "One JSON file with the lineup — days, stages and sets. Your picks, custom events and edits stay on this device." — "Download" / "Share" |
| C38 | Concert sheet: remix (H-5 / B-15) | "Edit a copy" |
| C39 | Delete build confirm (B-16) | "Delete this build?" / "{concert} will be removed from this device. A concert you already planned from it stays put." — "Delete build" / "Keep it" |
| C40 | Builder toasts (§13) | Per-action — see §11.2 |

### C15 — performance notification pool (title / body)

1. "{artist} in {x} mins" / "Head to {stage} and grab your spot 🙌"
2. "{artist} is performing in {x} mins" / "Head to {stage} and prepare to enjoy"
3. "{artist} is up next!" / "{stage}, {x} minutes — time to start moving."
4. "{x} mins till {artist}" / "Front row won't wait — head to {stage}."
5. "Incoming: {artist} 🎤" / "Hitting {stage} in {x} mins. You know what to do."

### 11.1 Provisional copy (added during implementation, pending deck sign-off)

| Where | Copy |
|-------|------|
| O-2 / S-3 backburner-notify checkbox | "Also notify me for backburner sets" / "Nudges for clash runner-ups too — you can still mute them one by one." |
| H-5 planned sheet | Section "Your days" · rows "{n} picks · tap to preview" · button "Edit your plan" |
| H-5 download failure toast | "Couldn't download the concert — check your signal and try again." |
| H-2b empty server list | "Nothing new to plan right now." / "New concerts show up here — JSON upload works too." |
| W-4 pagination | "Show {n} more · {remaining} left" |
| W-2 view toggle (aria labels) | "Compact view" / "Detailed view" |
| W-2 detailed view, scrolled away from now | "Jump to now" |
| S-5 confirm dialog | "Cancel this concert plan?" / "Your picks, custom events, and edits for {concert} will be deleted from this device. The concert stays available to plan again." — "Cancel plan" / "Keep my plan" |
| W-1/W-3/W-4 currently-playing marker | "LIVE" · countdown reads "{n} mins left" / "{h}h {mm}m left" / "ending now" |
| G-2 globe, measured-slow state | "Online (slow)" / "Your connection is sluggish — syncing may take a while." |

(Screen microcopy from design.pen — step titles, widget titles, empty states, timetable labels — is used verbatim from the design file and collected in `kawan-ngonser-frontend/app/utils/copy.ts`.)

### 11.2 Concert Builder copy (C35 / C40 detail)

**C35 readiness checklist items** (B-10) — only the unmet ones are listed:

- "Name your concert"
- "Set a timezone"
- "Add at least one day"
- "Add at least one stage"
- "Add at least one set"
- "Finish {n} incomplete set(s)"

**C40 toast confirmations:**

- Build created (B-1): "New build started — add your days next."
- Export downloaded (B-13): "{concert} exported — v{n} is ready to share. 🎫"
- Export blocked (B-10): "Add {what} before you can share this one."
- Planned from a build (B-12): "{concert} is on your list — let's plan it."
- Forked (B-15): "Copied — {concert} is yours to edit now."
- Build deleted (B-16): "Build deleted."
- Stage removed with sets (B-6): "{stage} removed — {n} set(s) moved to {other}."
- Same-stage overlap (B-7): "{stage} has two sets at once — check the times."
- Re-import, older file (B-14): "That file is v{n} — you already have v{m}. Keeping yours."
- Re-import, newer file (B-14): "Updated to v{n} — your plan survived the update. ✨"
- `event_id` collision (B-11): "That id is taken on this device — try {suggestion}."

### C16 — custom event notification pool (title / body)

1. "{event} in {x} mins" / "You planned this — don't bail on yourself."
2. "Time for {event}" / "{x} minutes to go — squeeze it in before the next set."
3. "{event} — {x} mins away" / "Future you says thanks."

### C29 — performance-action toast confirmations

- Skip (C17): "Skipped — {artist} is off your list."
- Make my pick (C18): "{artist} is your pick — {other} goes to the backburner."
- Notify opt-in (C19): "We'll nudge you before {artist} too."
- Notify opt-out (C23): "Okay — no nudges for {artist}."
- Auto-promotion (W-2): "{artist} moved up from the backburner."
- Watch this (C21): "Added — {artist} is on your list."
- Edit saved (C20): "Set updated — the new times are on your timetable."
- Removed (C20): "{artist} removed from your timetable."

### C30 — settings saved toast confirmations

- Rearrange widgets (S-1): "Widget order saved."
- Notification lead time (S-2): "Lead time set to {n} min — future nudges follow it."
- Conflict display (S-3): "Conflict display updated — the timetable follows suit."

Toast semantics: success/confirmation toasts use `success` iconography, failure toasts use `danger` (§12.3); all toasts sit on `surface-raised` (§12.1).

---

## 12. Visual Design — Color Scheme ("Night Stage")

Design constraints that drove the palette:

1. **Stage colors are data-driven** (`stages[].color`) and dominate the timetable — app chrome stays neutral so arbitrary stage palettes never clash with it.
2. **Night use + battery anxiety** (G-3) → **dark theme is the default**; near-black base saves OLED battery and fits the festival setting.
3. **Daytime outdoor legibility** → high contrast throughout, plus a light theme — auto-switched by system preference or forced manually via the theme toggle (G-5).

### 12.1 Base — dark theme (default)

| Token | Hex | Use |
|-------|-----|-----|
| `bg` | `#0F1017` | App background (near-black, slight blue cast — not pure black, so cards still lift) |
| `surface` | `#181A24` | Cards, widgets |
| `surface-raised` | `#232635` | Bottom sheets, dialogs, toasts, sticky headers |
| `border` | `#2E3143` | Dividers, card outlines |
| `text` | `#F5F6FA` | Primary text |
| `text-secondary` | `#9DA1B4` | Times, stage names, captions |
| `text-muted` | `#6A6E82` | Disabled, past/collapsed hours |

### 12.2 Brand

| Token | Hex | Use |
|-------|-----|-----|
| `primary` | `#7C5CFF` | Buttons, links, active states, selection checkboxes, "Watch this" (C21), countdown digits |
| `primary-pressed` | `#6847E6` | Pressed/hover state |
| `on-primary` | `#FFFFFF` | Text/icons on `primary` and on the hero gradient (both themes) |
| `hero-gradient` | `#7C5CFF → #C94FD6` | Big moments only: onboarding "All set!" (O-5), day-complete banner (F-2), splash |

Rationale: electric violet reads as stage-lights-at-night, matches the energetic copy tone, and is a hue festival organizers rarely use for stage colors (they tend toward reds/oranges/teals) — so timetable collisions are unlikely.

### 12.3 Semantic

| Token | Hex | Use |
|-------|-----|-----|
| `success` | `#3DDC97` | Globe icon when online (G-2), sync success |
| `warning` | `#FFB020` | Battery indicator + toasts (G-3), sync advisory banner (F-1) |
| `danger` | `#F0435A` | "Cancel this concert plan" (S-5), remove-performance (W-2) |
| `info` | `#4CC3FF` | Offline states (G-4), install reminder (G-1), tooltips |

### 12.4 Data-driven color rules

- **Backburner vs preferred (O-2 / W-3):** no separate hue — backburner entries render in the same stage color at **~50% opacity** (whole entry dimmed, no border treatment). Reads as "dimmed priority" without stealing a semantic color, and works inside both O-2 renderings (equal split / hidden).
- **Stage colors are untrusted input:** clamp lightness into a readable band and auto-pick black/white text per chip, so an extreme stage color (e.g. neon yellow) never breaks contrast.
- **Custom events (W-2):** neutral slate chip (`surface-raised`) with an icon — visually distinct from stage-colored performances.
- **Tinted fills:** chip, banner, and selection backgrounds are always the base color at **~8–17% alpha** over the surface (e.g. selection `primary` @10%, sync advisory `warning` @9%, install reminder `info` @8%, timetable entries stage color @12%) — no separate pastel palette to maintain, and it works over both themes.

### 12.5 Light theme

Same hues, darkened where needed for AA contrast on light surfaces. Values as implemented in `design.pen` (theme axis `mode: light`):

| Token | Hex |
|-------|-----|
| `bg` | `#FAFAFC` |
| `surface` | `#FFFFFF` |
| `surface-raised` | `#F1F1F7` |
| `border` | `#E4E5EE` |
| `text` | `#1A1C26` |
| `text-secondary` | `#5B5F73` |
| `text-muted` | `#9296A8` |
| `primary` | `#6847E6` |
| `primary-pressed` | `#5638C9` |
| `success` | `#1FA870` |
| `warning` | `#E09600` |
| `danger` | `#D42B44` |
| `info` | `#1E9DE0` |

`on-primary`, the hero gradient, and stage colors are identical in both themes (G-5e).

---

## 13. Concert Builder

> **Purpose:** let a user author a concert schedule themselves — for a festival the app doesn't carry, a lineup announced only on Instagram, a campus gig, a private event — and hand it to friends as a single JSON file they can plan against. The Builder is a pure **authoring** tool: it never talks to the backend, and it never exports personal plan data.

### 13.1 Lifecycle

A build lives in `local_concert_builds` (§3.5), separate from the concert cache, and can leave that store by two independent doors:

```
                         ┌─ "Plan this concert" (B-12) ─┐
                         │                              ▼
   Concert Builder ──────┤          local_concert_cache (source: 'builder')
   local_concert_builds  │                              │
        ▲                │                              ▼
        │                └─ "Export JSON" (B-13) ─┐   onboarding (§6) → plan → concert-day home (§7)
        │                                         ▼
        │                                {event_id}-v{n}.json
        │                                         │
        │                                   (any device)
        │                                         ▼
        └────── "Edit a copy" (B-15) ◄──── H-3 upload ──► "Plan for this concert" (H-5a)
```

The build itself is never consumed by either door — it stays in the list, editable, as the master copy.

### 13.2 Requirements

| ID | Requirement |
|----|-------------|
| B-1 | **Entry point:** the H-6 "Build a concert" card (C32) on the default home, beside the JSON-upload card. Tapping it creates an empty build and opens step 1. Available offline. |
| B-2 | **Your builds:** home list (d) (H-2). Each row shows name, "{d} days · {n} sets · edited {when}", and a **Draft** or **Ready** chip (B-10). Tapping opens the Builder at the last step edited. Swipe/overflow exposes **Export** (B-13) and **Delete** (B-16). The whole section is omitted when there are no builds — the B-1 card is the empty state. |
| B-3 | **Builder shell:** four steps — **Concert details · Days · Stages · Performances** (C34) — behind a tappable step rail. Unlike onboarding (§6) the flow is **non-linear**: any step can be opened at any time, in any order, and the user can leave and come back. There is no "finish" button; a build is done when it is Ready (B-10). |
| B-4 | **Step 1 — Concert details:** `name` (required), `place`, `description`, `timezone` (required; IANA picker defaulting to the device zone), `logo` (a **URL string**, per §3.1 — no file picker, so exports stay small and the store stays inside quota). An **Advanced** disclosure exposes the `event_id` (B-11). |
| B-5 | **Step 2 — Days:** add, remove, and re-date days. `day_index` is **derived from date order**, 1-based, and renumbered automatically on every change — performances follow their day, never their old index. At least one day is required. Removing a day that holds performances is confirmed and names the count. |
| B-6 | **Step 3 — Stages:** add, rename, recolor, remove. `stage_id` is slugified from the name and unique within the build. Color is chosen from a preset swatch row plus a free hex field, and the preview applies the §12.4 clamp so an unreadable pick is visibly corrected before it is saved. Removing a stage that holds performances is confirmed and offers to **reassign them to another stage** or delete them with it. |
| B-7 | **Step 4 — Performances:** grouped by day, sorted by start time, each row bearing its stage color exactly as the timetable does (§12.4). Per-day **"Add a set"** button. Cross-stage overlaps are **legitimate content and never flagged** — they are the clashes the whole app exists to resolve. A **same-stage overlap is a data error** and shows an inline warning on both rows. |
| B-8 | **Add / edit performance sheet:** `artist_name` (required), `artist_image` (URL), day, stage, start time, end time. **An end at or before the start is read as a past-midnight spill** and the set keeps its `day_index` (§3.1) — the sheet says so rather than rejecting it. Carries a delete action. |
| B-9 | **Autosave:** every change writes through to `local_concert_builds` immediately, bumping `updated_at` and incrementing `version` (TR-5 semantics). There is no save button. Write failure surfaces C31 like every other local write. |
| B-10 | **Readiness:** a build is **Ready** when it has a name, a timezone, ≥1 day, ≥1 stage, ≥1 performance, and every performance has an artist name, a valid day and stage, and a resolvable time. Until then it is a **Draft**: "Plan this concert" and "Export JSON" are disabled, and a checklist (C35) lists exactly what is missing. |
| B-11 | **`event_id`:** generated once at creation as the slugified name plus a 4-character random suffix (`the-sounds-project-a4f9`), editable under Advanced (B-4). It must be unique across **both** local builds and cached concerts; a collision is refused with a suggested alternative (C40). Forks always regenerate it (B-15). |
| B-12 | **Plan this concert** (C36): copies the build into `local_concert_cache` with `source: 'builder'` and enters onboarding (§6). The build **stays in the builds list and stays editable** — later edits do not touch the planned copy. Re-planning an already-planned build goes through the F-1 re-validation path (B-14) so an existing plan survives. |
| B-13 | **Export JSON:** serializes the build to the **§3.1 camelCase wire shape** — structurally identical to a `GET /concerts/:id` response — and offers it as `{event_id}-v{version}.json`. The export sheet (C37) states the day / stage / set counts and what the file does **not** contain (no picks, no custom events, no personal data). Where `navigator.share` exists, **Share** sits beside **Download**; both work offline. Disabled while the build is a Draft (B-10). |
| B-14 | **Re-import of a newer version:** uploading (H-3) a file whose `id` matches an already-planned concert and whose `version` is **higher** replaces the cached concert data and runs the **F-1 plan re-validation** (§7.1) — including the C12 confirmation when local performance edits exist. A lower or equal version is declined with a toast instead of silently overwriting (C40). ⚠️ This changes today's upload path, which overwrites unconditionally. |
| B-15 | **Edit a copy (remix):** the H-5 concert detail sheet offers **"Edit a copy"** (C38) for any cached concert — server, upload, or builder alike. It forks the concert data into a new build with a fresh `event_id`, `version: 1`, `origin: 'forked'`, and `forked_from_event_id` recorded. The source cache entry and any plan on it are untouched, and **no plan data is copied**. |
| B-16 | **Delete a build:** destructive — last in the overflow, visually distinct, behind the C39 confirmation, which states explicitly that a concert already planned from this build is *not* removed. |
| B-17 | **Offline:** the entire Builder works with zero connectivity (TR-2). The only network-dependent element is the *preview* of a logo or artist image, which degrades to a placeholder; the URL is stored either way. |

### 13.3 Screens (design.pen)

| Node | Covers |
|------|--------|
| `Home – Default` · `Home – Default (Light)` · `Home – Other Concerts (S-4)` | **Updated in place, not duplicated:** the H-6 build card beside the H-3 upload card, and the B-2 "Your builds" section between past concerts and the install reminder. All three home variants stay in sync. |
| `Builder – Concert Details` | B-3 step rail, B-4 fields, B-11 `event_id` under Advanced, B-9 autosave note |
| `Builder – Days` | B-5, including the renumbering note |
| `Builder – Stages` | B-6 stage list and colour editor, §12.4 clamp note with a live entry preview |
| `Builder – Performances` | B-7 day groups (cross-stage overlap unflagged, same-stage overlap warned), B-10 **Ready** state, B-12 / B-13 actions |
| `Sheet – Add Performance` | B-8, including the past-midnight note |
| `Sheet – Export Concert` | B-13 file card, what's-in / what's-out list, Download + Share |
| `Builder States` | B-2 empty (the B-1 card alone), B-10 **Draft** checklist with disabled CTAs, B-7 warning strip, two C40 toasts |

Five reusable components back these screens: **`Builder Step Rail`** (the non-linear B-3 rail — tappable pills, deliberately not the linear onboarding progress bars), **`Builder Field`** (label + boxed input, used on the step screens and inside the sheets), **`Builder List Row`** (the day and stage rows), **`Build Concert Card`** (the H-6 entry card), and **`Build Row`** (a B-2 list row). The last two are instanced across all three home screens, so C32/C33 copy changes propagate to every variant at once. Everything else reuses the existing kit — `Status Bar`, `Performance Card`, `Button Primary` / `Button Secondary`, `Toast`.
