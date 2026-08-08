import { Router } from "express";

/**
 * Round-trip probe for the client's G-2 connectivity indicator. The client
 * times this call to tell "Online" from "Online (slow)".
 *
 * Deliberately does NOT touch Mongo: this measures the NETWORK, not the
 * database (the process only listens once Mongo is reachable — see index.ts).
 * Adding a DB round trip here would make a healthy phone on a healthy network
 * report "slow" whenever Mongo is merely busy.
 *
 * Keep the response tiny and uncacheable, and take no custom request headers,
 * so a cross-origin probe stays a simple CORS request — a preflight would
 * double the round trips and corrupt the measurement.
 */
export function healthRouter(): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ ok: true });
  });

  return router;
}
