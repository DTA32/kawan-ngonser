import type {
  ApiPerformance,
  AppConfigDoc,
  AppConfigResponse,
  ConcertDetail,
  ConcertDoc,
  ConcertSummary,
  ConcertSummaryDoc,
} from "./types.js";

// Formatter construction is expensive and a detail response formats hundreds
// of timestamps — cache one formatter per timezone.
const wallTimeFormatters = new Map<string, Intl.DateTimeFormat>();

function wallTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = wallTimeFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    wallTimeFormatters.set(timeZone, fmt);
  }
  return fmt;
}

/**
 * §3.1 serves venue-local wall time without offset ("2026-08-08T19:00:00").
 * Seeded docs store BSON Dates (UTC instants); strings pass through verbatim.
 */
export function toLocalWallTime(value: Date | string, timeZone: string): string {
  if (typeof value === "string") return value;
  const parts = new Map(
    wallTimeFormatter(timeZone).formatToParts(value).map((p) => [p.type, p.value]),
  );
  const part = (type: Intl.DateTimeFormatPartTypes): string => {
    const v = parts.get(type);
    if (v === undefined) throw new Error(`Missing date part '${type}' for timezone '${timeZone}'`);
    return v;
  };
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`;
}

// Mappers build payloads as allowlist object literals so internal fields
// (_id, visible, created_at, updated_at) can never leak.

export function toConcertSummary(doc: ConcertSummaryDoc): ConcertSummary {
  return {
    id: doc.event_id,
    version: doc.version,
    name: doc.name,
    logo: doc.logo,
    place: doc.place,
    description: doc.description,
    days: doc.days.map((d) => ({ index: d.day_index, date: d.date })),
  };
}

export function toConcertDetail(doc: ConcertDoc): ConcertDetail {
  return {
    ...toConcertSummary(doc),
    timezone: doc.timezone,
    stages: doc.stages.map((s) => ({ id: s.stage_id, name: s.name, color: s.color })),
    performances: doc.performances.map(
      (perf): ApiPerformance => ({
        id: perf.performance_id,
        artistName: perf.artist_name,
        artistImage: perf.artist_image,
        dayIndex: perf.day_index,
        stageId: perf.stage_id,
        start: toLocalWallTime(perf.start_time, doc.timezone),
        end: toLocalWallTime(perf.end_time, doc.timezone),
      }),
    ),
  };
}

export function toAppConfig(doc: AppConfigDoc): AppConfigResponse {
  return {
    defaultLeadTimeMin: doc.default_lead_time_min,
    batteryLowThresholdPct: doc.battery_low_threshold_pct,
    notificationTemplates: doc.notification_templates.map((t) => ({
      type: t.type,
      title: t.title,
      body: t.body,
    })),
    copyStrings: doc.copy_strings,
  };
}
