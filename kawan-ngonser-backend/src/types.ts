import type { ObjectId } from "mongodb";

// ---------------------------------------------------------------------------
// MongoDB document shapes (snake_case) — see ../../mongodb.mermaid and the
// seed data in ../../migrations/. The API never serves these directly.
// ---------------------------------------------------------------------------

export interface DayDoc {
  day_index: number;
  date: string; // "YYYY-MM-DD", venue-local
}

export interface StageDoc {
  stage_id: string;
  name: string;
  color: string;
}

export interface PerformanceDoc {
  performance_id: string;
  artist_name: string;
  artist_image: string;
  day_index: number;
  stage_id: string;
  start_time: Date | string; // BSON Date when seeded via mongoimport ($date); strings pass through as-is
  end_time: Date | string;
}

export interface ConcertDoc {
  _id?: ObjectId;
  event_id: string;
  visible: boolean;
  version: number;
  name: string;
  logo: string;
  place: string;
  description: string;
  timezone: string; // IANA name, e.g. "Asia/Jakarta"
  days: DayDoc[];
  stages: StageDoc[];
  performances: PerformanceDoc[];
  created_at?: Date;
  updated_at?: Date;
}

/** What the GET /concerts projection returns — heavy arrays stay in Mongo. */
export type ConcertSummaryDoc = Pick<
  ConcertDoc,
  "event_id" | "version" | "name" | "logo" | "place" | "description" | "days"
>;

export interface NotificationTemplateDoc {
  type: "performance" | "custom_event";
  title: string;
  body: string;
}

export interface AppConfigDoc {
  _id?: ObjectId;
  default_lead_time_min: number;
  battery_low_threshold_pct: number;
  notification_templates: NotificationTemplateDoc[];
  copy_strings: Record<string, unknown>; // strings or {text, confirm, dismiss} objects — served verbatim
  updated_at?: Date;
}

// ---------------------------------------------------------------------------
// API payload shapes (camelCase) — REQUIREMENTS.md §3.1 / §3.2
// ---------------------------------------------------------------------------

export interface ApiDay {
  index: number;
  date: string;
}

export interface ApiStage {
  id: string;
  name: string;
  color: string;
}

export interface ApiPerformance {
  id: string;
  artistName: string;
  artistImage: string;
  dayIndex: number;
  stageId: string;
  start: string; // venue-local wall time, no offset: "2026-08-08T19:00:00"
  end: string;
}

export interface ConcertSummary {
  id: string;
  version: number;
  name: string;
  logo: string;
  place: string;
  description: string;
  days: ApiDay[];
}

export interface ConcertDetail extends ConcertSummary {
  timezone: string;
  stages: ApiStage[];
  performances: ApiPerformance[];
}

export interface VersionResponse {
  version: number;
}

export interface AppConfigResponse {
  defaultLeadTimeMin: number;
  batteryLowThresholdPct: number;
  notificationTemplates: NotificationTemplateDoc[];
  copyStrings: Record<string, unknown>;
}

export interface ApiError {
  error: "not_found" | "internal_error";
  message: string;
}
