import "dotenv/config";
import { createApp } from "./app.js";
import { connect, ensureIndexes } from "./db.js";
import { loadEnv } from "./env.js";

const env = loadEnv();

try {
  const { client, db } = await connect(env.mongodbUri, env.dbName);
  await ensureIndexes(db);

  const server = createApp(db).listen(env.port, () => {
    console.log(`kawan-ngonser-backend listening on :${env.port} (db: ${env.dbName})`);
  });

  const shutdown = (): void => {
    server.close(() => {
      void client.close().finally(() => process.exit(0));
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} catch (err) {
  // A read-only API with no reachable database has nothing to serve.
  console.error("Failed to start:", err);
  process.exit(1);
}
