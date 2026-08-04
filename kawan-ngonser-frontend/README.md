# Kawan Ngonser — Frontend

Offline-first festival-planner PWA ("concert buddy"). Nuxt 4 SPA + Nuxt UI v4 /
Tailwind v4, Pinia + Dexie (IndexedDB), Luxon, zod, `@vite-pwa/nuxt`.
Spec: `../REQUIREMENTS.md` (source of truth). Design: `../design.pen`
(open with Pencil). Backend: `../kawan-ngonser-backend` (Express, port 3001).

## Develop

```sh
bun install
cp .env.example .env        # NUXT_PUBLIC_API_BASE, default http://localhost:3001
bun run dev                 # http://localhost:3000
```

Server-list / sync features need the backend running (`../kawan-ngonser-backend`)
with a seeded Mongo (`../migrations/README.md`). Everything else works without
it — upload `tests/fixtures/sounds-project-2026.wire.json` through the home
screen's **Upload concert JSON** card (that file is exactly what
`GET /concerts/:id` serves).

### Dev time travel

The festival dates are fixed (2026-08-07…09), so every time-dependent state is
simulated. In dev, the floating clock button (bottom right) offers presets
(before festival / Day 1 19:02 / day done / after), or pass
`?t=2026-08-07T19:02:00+07:00`. The override drives the whole app clock —
relative labels, the day-board switch, F-2 banners, and notification firing.

## Verify

```sh
bun run test                # 119 unit tests (domain logic, timetable, scheduler, sync+Dexie)
bun run typecheck           # vue-tsc
bun run generate            # static PWA build → .output/public
bunx serve .output/public   # Lighthouse-installable preview
```

Manual passes worth doing before festival day (all with DevTimeTravel):
theme×3 hard-reload (no flash), devtools-offline sweep (globe grey, H-4 upload
still works, day board fully functional), onboarding clash queue + browser
back + resume, `?browse=1` + day preview, timetable (past collapse / expand /
50-50 vs hidden / gap → custom event), sheet action matrix (C17–C23),
sync banner + C12 (bump `version` in Mongo), widget rearrange (touch + keyboard),
real-device install (Android + iOS).

## Docker

```sh
docker build --build-arg NUXT_PUBLIC_API_BASE=https://api.example.com -t kawan-ngonser-frontend .
docker run -p 8080:80 kawan-ngonser-frontend
```

Static build served by nginx (SPA fallback, `no-cache` on `sw.js`/`index.html`/
manifest, immutable `_nuxt/*`). `NUXT_PUBLIC_API_BASE` is baked at **build**
time — the static output cannot read env vars at runtime. PWA install requires
HTTPS in production (TLS terminates at whatever fronts the container).

## Architecture notes

- `app/domain/` — pure logic (no Vue/Nuxt/Dexie imports, `now` always a
  parameter): normalizer, conflicts, pick state machine, effective schedule,
  day state, F-1 sync revalidation, notification math. This is what the test
  suite covers.
- `app/db/` — Dexie mapping of `../indexeddb.mermaid` (snake_case rows), plus
  one addition: `local_kv` (config cache, notification ledger, dismissals).
  `conflict_display_pref` is `'equal' | 'hidden'` (`smaller` was dropped by
  O-2 — the mermaid still lists it).
- Stores are memory-first with write-through persistence; a failed local write
  raises the C31 toast. Sync commits all five tables in **one** Dexie
  transaction then re-hydrates.
- Wire contract: the API serves §3.1 camelCase with naive venue-local wall
  times. The normalizer also accepts the snake_case seed shape and every
  timestamp form (offset ISO / Z-UTC / `{$date}` / epoch) — see
  `app/domain/normalize.ts`.
- Theme: `--kn-*` CSS vars (dark default, `.light` overrides) mapped through
  Tailwind's `@theme inline` and bridged onto Nuxt UI's `--ui-*` tokens.
  Stage colors are untrusted input — `app/utils/stage-color.ts` clamps
  lightness and derives tints.

## Known platform limits (communicate before festival day)

- **Closed-app notifications are impossible on the web** (Notification
  Triggers API is dead; push needs signal — the venue has none). Notifications
  fire while the PWA is open or backgrounded (Android/Chromium); iOS freezes
  background timers → catch-up on reopen. In-app copy tells users to keep the
  app open in the background.
- Battery indicator/toasts are Chromium-only (G-3 degrades to nothing on iOS).
- iOS has no install prompt API — the G-1 card shows Share → Add to Home
  Screen instructions; notification permission requires the installed PWA.
- Artist images are cached as opaque responses (no CORS on the CDNs); Chromium
  pads their quota accounting — the app requests persistent storage after
  onboarding. Serving images through the API origin with CORS would remove
  this caveat entirely (worth a backend follow-up).
