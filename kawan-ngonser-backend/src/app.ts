import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { Db } from "mongodb";
import { concertsRouter } from "./routes/concerts.js";
import { configRouter } from "./routes/config.js";
import { healthRouter } from "./routes/health.js";

export function createApp(db: Db): Express {
  const app = express();

  // Public read-only API, no credentials — wide-open CORS is fine and covers
  // the Nuxt dev server on another port.
  app.use(cors());

  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      console.log(
        `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`,
      );
    });
    next();
  });

  app.use("/concerts", concertsRouter(db));
  app.use("/config", configRouter(db));
  app.use("/health", healthRouter());

  app.use((_req, res) => {
    res.status(404).json({ error: "not_found", message: "Route not found" });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express identifies error middleware by arity
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Internal server error" });
  });

  return app;
}
