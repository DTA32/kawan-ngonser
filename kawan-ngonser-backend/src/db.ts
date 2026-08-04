import { MongoClient, type Db } from "mongodb";

export async function connect(uri: string, dbName: string): Promise<{ client: MongoClient; db: Db }> {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  return { client, db: client.db(dbName) };
}

export async function ensureIndexes(db: Db): Promise<void> {
  await db.collection("concerts").createIndex({ event_id: 1 }, { unique: true });
}
