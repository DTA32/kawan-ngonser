# 🎶 Kawan Ngonser

**Your concert buddy.** An offline-first PWA that helps a festival-goer plan
which artists to watch across a multi-day, multi-stage music festival — picks,
clash duels, a stage-colored timetable, and on-device nudges that fire with
zero signal.

> **Fully vibecoded.** This entire app — spec-to-ship — was built in one
> night from an late-night overthinking idea by a relay of 
> **Claude (Fable 5)** agents, each handing off to the next:
>
> 1. **The planner** interviewed the human and hammered every open question
     into a settled requirements doc — features, conflict semantics, sync
     rules, a verbatim copy deck.
> 2. **The designer** picked the "Night Stage" color scheme and drew the
     complete mobile design in [pencil.dev](https://pencil.dev) — every
     screen, sheet, toast, and empty state.
> 3. **Two builders** implemented the frontend (Nuxt PWA) and backend
     (Express + Mongo) in parallel sessions, pinning the wire contract
     between them through shared notes.
> 4. **The QA agent** click-tested all 17 user-flow steps end-to-end in a
     real browser, filed an 11-defect report, and the blockers were patched
     from live feedback — regression-tested before sunrise.
>
> First real-world mission: **The Sounds Project Vol.9**, Jakarta,
> 7–9 Aug 2026 (128 sets, 7 stages, 3 days).
> Total damage: **±2 million tokens** burned in one night. Worth it. 🔥

## Feature highlights

- **Guided planning** — pick your attendance days and must-see artists per
  day; overlapping picks are settled through a quick head-to-head duel
  ("Schedule clash! Who gets you?") — preferred vs. backburner.
- **Day-of dashboard** — on concert day the home screen becomes a
  personalizable widget board: up next, a stage-colored timetable, backburner
  and unpicked sets, and previews of your next days.
- **A timetable that adapts** — starts at the current time, collapses the
  past behind "Earlier today", expands to end of day, renders clashes 50/50
  (or hides the runner-up — your call), and takes custom events (dinner,
  toilet break) alongside performances.
- **Local notifications** — a heads-up a configurable number of minutes
  before every set you plan to watch and every custom event — scheduled
  on-device so they fire with no signal. Backburner sets can notify too,
  per set or by default.
- **Offline-first by design** — concert data comes from the server or a
  manual JSON upload; after that everything works offline. Artist photos are
  pre-cached (and sacrificed automatically if storage runs tight — your plan
  always wins). Connectivity and low-battery indicators keep you informed.
- **Schedule-change friendly** — shift a set's time or remove it when a
  performer cancels (local edits, flagged); server updates sync without
  destroying your plan — picks are re-validated, dropped sets pruned, freed
  backburners promoted, new clashes re-dueled.
- **Night Stage theme** — near-black OLED-friendly dark default, a light
  theme for daytime legibility, instant no-flash switching, and stage colors
  that are clamped so even a neon-yellow stage stays readable.

## What's in this repo

| Path                                                          | What                                                                                |
|---------------------------------------------------------------|-------------------------------------------------------------------------------------|
| [`REQUIREMENTS.md`](REQUIREMENTS.md)                          | The source of truth — features, copy deck, palette (v7, updated as the app evolved) |
| `design.pen`                                                  | The full 390px mobile design (open with Pencil) — every screen, sheet, and state    |
| [`kawan-ngonser-frontend/`](kawan-ngonser-frontend/README.md) | Nuxt 4 PWA — the app itself                                                         |
| [`kawan-ngonser-backend/`](kawan-ngonser-backend/README.md)   | Express 5 + MongoDB API                                                             |
| `indexeddb.mermaid`                                           | On-device data schema (the backend holds **no** user state)                         |
| `mongodb.mermaid`                                             | Server-side schema                                                                  |
| `migrations/`                                                 | Real seed data — The Sounds Project Vol.9 lineup + app config                       |

## Quick start

```sh
# 1. Mongo + seed (see migrations/README.md for the mongoimport commands)
docker start mongodb-cont

# 2. Backend on :3001
cd kawan-ngonser-backend && npm install && npm run dev

# 3. Frontend on :3000
cd kawan-ngonser-frontend && bun install && bun run dev
```

No backend handy? The app works fully offline — upload
`kawan-ngonser-frontend/tests/fixtures/sounds-project-2026.wire.json` through
the home screen's **Upload concert JSON** card and plan away.

The festival dates are fixed, so the frontend ships a dev **time-travel**
tool (floating clock button): jump to "Day 1 · 19:02", day-complete, after
the festival, or any custom moment — every countdown, banner, and
notification follows.

## How it was verified (in the same night)

- **124 unit tests** over the pure domain core: clash detection, the pick
  state machine with backburner auto-promotion, sync re-validation, the
  timetable clustering model, notification math, and the payload normalizer
  against the real 128-set lineup.
- **Browser E2E smoke** (`bun run scripts/e2e-smoke.ts`): upload → onboarding
  → clash duel → concert-day board → custom event, in a real Chrome.
- **Agent QA**: a second Claude agent click-tested all 17 flow steps on a
  mobile viewport and filed an 11-defect report; the blockers (a
  storage-quota data-loss path, undismissable sheets) were fixed and
  regression-tested the same night.

## Honest platform notes

The web can't fire scheduled notifications while a PWA is fully **closed**
(the Notification Triggers API is dead, and push needs signal — the venue has
none). Notifications fire while the app is open or backgrounded; iOS catches
up on reopen. The app says so out loud: *keep Kawan Ngonser open in the
background during the show.* Battery indicators are Chromium-only and degrade
to nothing elsewhere — by design, never an error.

---

*Built with Nuxt 4, Nuxt UI, Tailwind 4, Pinia, Dexie, Luxon, Zod,
Workbox — and one very long prompt.* 🤖
