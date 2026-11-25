import { MongoClient } from 'mongodb';

let client = null;
let dbInstance = null;

/**
 * Connect lazily and reuse the MongoDB Atlas client across requests.
 */
export async function getDb() {
  if (dbInstance) return dbInstance;

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME || 'sig_faskes_pekanbaru';

  if (!uri || uri.includes('<username>')) {
    throw new Error('MONGODB_URI belum dikonfigurasi pada file .env di root PA.');
  }

  client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
  });

  await client.connect();
  dbInstance = client.db(dbName);
  return dbInstance;
}

/**
 * Close MongoDB client cleanly on process shutdown.
 */
export async function closeDb() {
  if (client) {
    await client.close();
    client = null;
    dbInstance = null;
  }
}
