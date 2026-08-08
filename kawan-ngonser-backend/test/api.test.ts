import type { Express } from "express";
import { MongoClient, type Db } from "mongodb";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ensureIndexes } from "../src/db.js";
import type { AppConfigDoc, ConcertDoc } from "../src/types.js";
import { appConfig, hiddenConcert, visibleConcert } from "./fixtures.js";

// Runs against the local MongoDB (MONGODB_URI or the default below) using a
// throwaway database that is dropped before and after the suite.
const TEST_DB = "kawan_ngonser_test";
const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";

let client: MongoClient;
let db: Db;
let app: Express;

beforeAll(async () => {
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
  await client.connect();
  db = client.db(TEST_DB);
  await db.dropDatabase();
  await ensureIndexes(db);
  // Spread so insertMany's _id write-back never mutates the shared fixtures.
  await db
    .collection<ConcertDoc>("concerts")
    .insertMany([{ ...visibleConcert }, { ...hiddenConcert }]);
  await db.collection<AppConfigDoc>("app_configs").insertOne({ ...appConfig });
  app = createApp(db);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

describe("GET /concerts", () => {
  it("lists only visible concerts as summaries", async () => {
    const res = await request(app).get("/concerts");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(visibleConcert.event_id);
    expect(res.body[0].days[0]).toEqual({ index: 1, date: "2026-08-08" });
    expect(res.body[0]).not.toHaveProperty("performances");
    expect(res.body[0]).not.toHaveProperty("stages");
    expect(res.headers["cache-control"]).toBe("no-cache");
  });
});

describe("GET /concerts/:id", () => {
  it("serves the full §3.1 payload", async () => {
    const res = await request(app).get(`/concerts/${visibleConcert.event_id}`);
    expect(res.status).toBe(200);
    expect(res.body.timezone).toBe("Asia/Jakarta");
    expect(res.body.performances[0]).toEqual({
      id: "main-d1-alpha",
      artistName: "Alpha",
      artistImage: "https://example.com/alpha.jpg",
      dayIndex: 1,
      stageId: "main",
      start: "2026-08-08T19:00:00",
      end: "2026-08-08T20:00:00",
    });
    expect(res.body).not.toHaveProperty("_id");
    expect(res.body).not.toHaveProperty("visible");
  });

  it("404s identically for hidden and unknown concerts", async () => {
    for (const id of [hiddenConcert.event_id, "does-not-exist"]) {
      const res = await request(app).get(`/concerts/${id}`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "not_found", message: `Concert '${id}' not found` });
    }
  });
});

describe("GET /concerts/:id/version", () => {
  it("serves only the version, uncacheable", async () => {
    const res = await request(app).get(`/concerts/${visibleConcert.event_id}/version`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ version: visibleConcert.version });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("404s for hidden concerts", async () => {
    const res = await request(app).get(`/concerts/${hiddenConcert.event_id}/version`);
    expect(res.status).toBe(404);
  });
});

describe("GET /config", () => {
  it("serves the camelCase config", async () => {
    const res = await request(app).get("/config");
    expect(res.status).toBe(200);
    expect(res.body.defaultLeadTimeMin).toBe(15);
    expect(res.body.batteryLowThresholdPct).toBe(20);
    expect(res.body.notificationTemplates).toHaveLength(appConfig.notification_templates.length);
    expect(res.body.copyStrings).toEqual(appConfig.copy_strings);
    expect(res.body).not.toHaveProperty("updated_at");
  });

  it("404s once the config document is gone", async () => {
    await db.collection("app_configs").deleteMany({});
    const res = await request(app).get("/config");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found", message: "App config not found" });
  });
});

describe("GET /health", () => {
  it("answers without touching the database", async () => {
    // Registered before the catch-all 404, and independent of Mongo — the
    // /config suite above deletes the config doc and this must still pass.
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("is uncacheable, so the client always measures a real round trip", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("unknown routes", () => {
  it("404s with the JSON error shape", async () => {
    const res = await request(app).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found", message: "Route not found" });
  });
});
