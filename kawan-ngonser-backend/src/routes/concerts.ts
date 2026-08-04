import { Router, type Response } from "express";
import type { Db } from "mongodb";
import { toConcertDetail, toConcertSummary } from "../mappers.js";
import type { ConcertDoc, ConcertSummaryDoc } from "../types.js";

const SUMMARY_PROJECTION = {
  event_id: 1,
  version: 1,
  name: 1,
  logo: 1,
  place: 1,
  description: 1,
  days: 1,
} as const;

function concertNotFound(res: Response, id: string): void {
  res.status(404).json({ error: "not_found", message: `Concert '${id}' not found` });
}

export function concertsRouter(db: Db): Router {
  const router = Router();
  const concerts = db.collection<ConcertDoc>("concerts");

  router.get("/", async (_req, res) => {
    const docs = await concerts
      .find({ visible: true })
      .project<ConcertSummaryDoc>(SUMMARY_PROJECTION)
      .sort({ "days.0.date": 1 })
      .toArray();
    res.set("Cache-Control", "no-cache");
    res.json(docs.map(toConcertSummary));
  });

  router.get("/:id", async (req, res) => {
    const doc = await concerts.findOne({ event_id: req.params.id, visible: true });
    if (!doc) return concertNotFound(res, req.params.id);
    res.set("Cache-Control", "no-cache");
    res.json(toConcertDetail(doc));
  });

  router.get("/:id/version", async (req, res) => {
    // Drives the F-1 sync advisory — must never be cached anywhere.
    res.set("Cache-Control", "no-store");
    const doc = await concerts.findOne(
      { event_id: req.params.id, visible: true },
      { projection: { version: 1 } },
    );
    if (!doc) return concertNotFound(res, req.params.id);
    res.json({ version: doc.version });
  });

  return router;
}
