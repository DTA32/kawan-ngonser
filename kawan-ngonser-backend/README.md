# kawan-ngonser-backend

Read-only Express + MongoDB API for the Kawan Ngonser festival planner PWA
(`../REQUIREMENTS.md` TR-3). No auth, no user state (TR-4) — all user data
lives on-device.

## Endpoints

| Endpoint | Serves |
|---|---|
| `GET /concerts` | Summaries of visible concerts (no stages/performances) |
| `GET /concerts/:id` | Full concert payload (§3.1 camelCase) |
| `GET /concerts/:id/version` | `{"version": N}` — F-1 sync check, `Cache-Control: no-store` |
| `GET /config` | App config (lead time, battery threshold, notification template pools, copy strings); 404 until seeded — clients ship built-in fallbacks |

Concerts with `visible: false` are excluded everywhere (hidden and unknown ids
404 identically).

## Development

```sh
npm install
npm run dev        # http://localhost:3001
```

Needs a running MongoDB — configure via `.env` (see `.env.example`; defaults:
`mongodb://127.0.0.1:27017`, db `kawan_ngonser`, port 3001). Seed data lives in
`../migrations/` (mongoimport commands in its README).

## Tests

```sh
npm test
```

Mapper unit tests plus supertest integration tests against a throwaway
`kawan_ngonser_test` database on your local MongoDB — **mongod must be
running** for the integration suite.

## Docker

```sh
docker build -t kawan-ngonser-backend .
docker run --rm -p 3001:3001 \
  -e MONGODB_URI=mongodb://host.docker.internal:27017 \
  kawan-ngonser-backend
```

## Wire format

Mongo stores snake_case documents with BSON dates (see `../mongodb.mermaid` and
`../migrations/`); the API serves the §3.1 camelCase schema, with performance
times as venue-local wall-time strings (`"2026-08-08T19:00:00"`, no offset)
derived from the concert's `timezone`. The mapping layer is `src/mappers.ts`.
