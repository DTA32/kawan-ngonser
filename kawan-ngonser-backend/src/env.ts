export interface Env {
  mongodbUri: string;
  dbName: string;
  port: number;
}

export function loadEnv(): Env {
  return {
    mongodbUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017",
    dbName: process.env.DB_NAME ?? "kawan_ngonser",
    port: Number(process.env.PORT ?? 3001),
  };
}
