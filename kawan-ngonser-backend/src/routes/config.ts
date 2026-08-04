import { Router } from "express";
import type { Db } from "mongodb";
import { toAppConfig } from "../mappers.js";
import type { AppConfigDoc } from "../types.js";

export function configRouter(db: Db): Router {
  const router = Router();
  const configs = db.collection<AppConfigDoc>("app_configs");

  router.get("/", async (_req, res) => {
    // Single-document collection. When unseeded we 404 — the client ships
    // built-in fallbacks (§3.2), and server-side defaults would mask a
    // mis-seeded database.
    const doc = await configs.findOne({});
    if (!doc) {
      res.status(404).json({ error: "not_found", message: "App config not found" });
      return;
    }
    res.set("Cache-Control", "no-cache");
    res.json(toAppConfig(doc));
  });

  return router;
}
