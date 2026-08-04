import type { AppConfigDoc, ConcertDoc } from "../src/types.js";

export const visibleConcert: ConcertDoc = {
  event_id: "fixture-fest-2026",
  visible: true,
  version: 3,
  name: "Fixture Fest",
  logo: "https://example.com/logo.webp",
  place: "Example Park, Jakarta",
  description: "Two days of test coverage.",
  timezone: "Asia/Jakarta",
  days: [
    { day_index: 1, date: "2026-08-08" },
    { day_index: 2, date: "2026-08-09" },
  ],
  stages: [
    { stage_id: "main", name: "Main Stage", color: "#E85D75" },
    { stage_id: "garden", name: "Garden Stage", color: "#3FA34D" },
  ],
  performances: [
    {
      performance_id: "main-d1-alpha",
      artist_name: "Alpha",
      artist_image: "https://example.com/alpha.jpg",
      day_index: 1,
      stage_id: "main",
      start_time: new Date("2026-08-08T19:00:00+07:00"),
      end_time: new Date("2026-08-08T20:00:00+07:00"),
    },
    {
      // ends past midnight in venue time
      performance_id: "main-d1-midnight",
      artist_name: "Midnight Runner",
      artist_image: "https://example.com/midnight.jpg",
      day_index: 1,
      stage_id: "main",
      start_time: new Date("2026-08-08T23:15:00+07:00"),
      end_time: new Date("2026-08-09T00:15:00+07:00"),
    },
    {
      // pre-formatted wall-time strings must pass through untouched
      performance_id: "garden-d2-beta",
      artist_name: "Beta",
      artist_image: "https://example.com/beta.jpg",
      day_index: 2,
      stage_id: "garden",
      start_time: "2026-08-09T18:30:00",
      end_time: "2026-08-09T19:30:00",
    },
  ],
  created_at: new Date("2026-08-01T00:00:00Z"),
  updated_at: new Date("2026-08-01T00:00:00Z"),
};

export const hiddenConcert: ConcertDoc = {
  event_id: "hidden-fest-2026",
  visible: false,
  version: 1,
  name: "Hidden Fest",
  logo: "https://example.com/hidden.webp",
  place: "Nowhere",
  description: "Should never be served.",
  timezone: "Asia/Jakarta",
  days: [{ day_index: 1, date: "2026-09-01" }],
  stages: [{ stage_id: "main", name: "Main Stage", color: "#000000" }],
  performances: [],
  created_at: new Date("2026-08-01T00:00:00Z"),
  updated_at: new Date("2026-08-01T00:00:00Z"),
};

export const appConfig: AppConfigDoc = {
  default_lead_time_min: 15,
  battery_low_threshold_pct: 20,
  notification_templates: [
    {
      type: "performance",
      title: "{artist} in {x} mins",
      body: "Head to {stage} and grab your spot 🙌",
    },
    {
      type: "custom_event",
      title: "{event} in {x} mins",
      body: "You planned this — don't bail on yourself.",
    },
  ],
  copy_strings: {
    sync_banner: {
      text: "Fresh concert data just dropped. Sync it?",
      confirm: "Yes please",
      dismiss: "I'll handle it myself",
    },
    day_complete_banner: "That's a wrap for today. See you on Day {x} — rest up! 🌙",
  },
  updated_at: new Date("2026-08-04T00:00:00+07:00"),
};
