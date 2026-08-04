import { describe, expect, it } from "vitest";
import { toAppConfig, toConcertDetail, toConcertSummary, toLocalWallTime } from "../src/mappers.js";
import { appConfig, visibleConcert } from "./fixtures.js";

describe("toLocalWallTime", () => {
  it("converts a BSON Date to venue-local wall time without offset", () => {
    expect(toLocalWallTime(new Date("2026-08-08T19:00:00+07:00"), "Asia/Jakarta")).toBe(
      "2026-08-08T19:00:00",
    );
  });

  it("rolls into the next calendar day in venue time", () => {
    expect(toLocalWallTime(new Date("2026-08-08T17:15:00Z"), "Asia/Jakarta")).toBe(
      "2026-08-09T00:15:00",
    );
  });

  it("passes strings through verbatim", () => {
    expect(toLocalWallTime("2026-08-09T18:30:00", "Asia/Jakarta")).toBe("2026-08-09T18:30:00");
  });
});

describe("toConcertSummary", () => {
  const summary = toConcertSummary(visibleConcert);

  it("renames event_id to id and days day_index to index", () => {
    expect(summary.id).toBe("fixture-fest-2026");
    expect(summary.days).toEqual([
      { index: 1, date: "2026-08-08" },
      { index: 2, date: "2026-08-09" },
    ]);
  });

  it("exposes exactly the §3.1 summary fields", () => {
    expect(Object.keys(summary).sort()).toEqual([
      "days",
      "description",
      "id",
      "logo",
      "name",
      "place",
      "version",
    ]);
  });
});

describe("toConcertDetail", () => {
  const detail = toConcertDetail(visibleConcert);

  it("maps stages and performances to camelCase", () => {
    expect(detail.stages[0]).toEqual({ id: "main", name: "Main Stage", color: "#E85D75" });
    expect(detail.performances[0]).toEqual({
      id: "main-d1-alpha",
      artistName: "Alpha",
      artistImage: "https://example.com/alpha.jpg",
      dayIndex: 1,
      stageId: "main",
      start: "2026-08-08T19:00:00",
      end: "2026-08-08T20:00:00",
    });
  });

  it("converts Date times and passes string times through", () => {
    expect(detail.performances[1]).toMatchObject({
      start: "2026-08-08T23:15:00",
      end: "2026-08-09T00:15:00",
    });
    expect(detail.performances[2]).toMatchObject({
      start: "2026-08-09T18:30:00",
      end: "2026-08-09T19:30:00",
    });
  });

  it("never leaks internal fields", () => {
    expect(detail).not.toHaveProperty("_id");
    expect(detail).not.toHaveProperty("visible");
    expect(detail).not.toHaveProperty("created_at");
    expect(detail).not.toHaveProperty("updated_at");
    expect(detail.performances[0]).not.toHaveProperty("performance_id");
    expect(detail.stages[0]).not.toHaveProperty("stage_id");
  });
});

describe("toAppConfig", () => {
  const config = toAppConfig(appConfig);

  it("maps config fields to camelCase", () => {
    expect(config.defaultLeadTimeMin).toBe(15);
    expect(config.batteryLowThresholdPct).toBe(20);
  });

  it("keeps template type values snake_case and copy_strings verbatim", () => {
    expect(config.notificationTemplates.map((t) => t.type)).toEqual([
      "performance",
      "custom_event",
    ]);
    expect(config.copyStrings).toEqual(appConfig.copy_strings);
  });

  it("never leaks internal fields", () => {
    expect(config).not.toHaveProperty("_id");
    expect(config).not.toHaveProperty("updated_at");
  });
});
