# MongoDB migrations — The Sounds Project Vol.9

Seed data for the Kawan Ngonser backend (see `../mongodb.mermaid` for the schema).
One file per collection, in MongoDB Extended JSON (`$date` fields import as real
`Date` objects, stored with the venue's `+07:00` offset).

| File | Collection | Contents |
|------|------------|----------|
| `concerts.json` | `concerts` | 1 concert doc: 3 days, 7 stages, 128 embedded performances |
| `artists.json` | `artists` | 126 unique artists (master copy for the admin console) |
| `app_configs.json` | `app_configs` | Single config doc: lead time, battery threshold, notification template pools (C15/C16), server-tweakable copy (C11–C14) |

## Import

```sh
mongoimport --uri "mongodb://localhost:27017/kawan_ngonser" \
  --collection concerts --file concerts.json --jsonArray --drop
mongoimport --uri "mongodb://localhost:27017/kawan_ngonser" \
  --collection artists --file artists.json --jsonArray --drop
mongoimport --uri "mongodb://localhost:27017/kawan_ngonser" \
  --collection app_configs --file app_configs.json --jsonArray --drop
```

`--drop` replaces the collection on re-import; omit it to append.

## Data provenance & assumptions

- Set times transcribed from the official set-times posters in `../rundown/`
  (IMG_1495–IMG_1501, one per stage). Event metadata and logo URL from
  <http://thesoundsproject.com/>.
- **Every performance is assumed to last exactly 1 hour** — the posters only
  publish start times. Sets starting at 23:15 therefore end at 00:15 the next
  calendar day.
- Day 1 = 2026-08-07, Day 2 = 2026-08-08, Day 3 = 2026-08-09 (Asia/Jakarta).
- `performance_id` is a stable slug (`{stage_id}-d{day}-{artist-slug}`) so
  local plans survive re-syncs (mongodb.mermaid requirement).
- Artist photos come from the **Deezer API** (free, no key) via
  `fetch_artist_images.py`, which wrote `artist_images.json` (99 of 125
  looked-up artists matched). Matching is strict — a result is accepted only on
  a normalized exact name match with an actual photo (Deezer serves grey
  silhouettes from regular URLs; anything under 5 KB is rejected as a
  placeholder) — and known homonym collisions are blocklisted in
  `WRONG_MATCHES`. Tulus and Smash have curated Wikimedia Commons photos
  (`MANUAL_OVERRIDES`) because Deezer has no usable image for them. The 27
  unmatched artists (mostly local collectives/DJ crews) get deterministic
  ui-avatars.com initials placeholders. Each entry in `artist_images.json`
  keeps the Deezer link + fan count — spot-check generic names (Jen, Voxy,
  NPD, Inis, Marbles, Ali, 510…) and add ids to `WRONG_MATCHES` or a manual
  override if one turns out to be a foreign homonym.
- Stage colors are made up for the timetable (W-2); the festival doesn't
  publish official stage colors.
- The three "Secret Guest" slots (TSPSQUAD stage) are separate performances
  sharing one master artist entry.
- The website advertises "6 stages" but the official set-times posters list 7;
  the posters win.

## Regenerating

`generate_migrations.py` (same directory) contains the transcribed rundown as
data tables and emits all three JSON files. Edit it and re-run when the
schedule changes (the posters say "subject may change without prior notice"),
then bump `version` in `concerts.json` so clients detect the update (TR-5).

```sh
python3 generate_migrations.py
```

To refresh artist photos (e.g. after adding artists or fixing a wrong match),
re-run the Deezer lookup first — it rewrites `artist_images.json`, which the
generator reads:

```sh
python3 fetch_artist_images.py && python3 generate_migrations.py
```
