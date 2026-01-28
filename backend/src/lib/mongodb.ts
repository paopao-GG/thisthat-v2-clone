/**
 * MongoDB client stub for legacy code compatibility
 *
 * Note: This project has migrated from MongoDB to PostgreSQL.
 * This file is kept for backward compatibility with tests and legacy sync jobs.
 * In production Docker builds, MongoDB is not required and this stub is used.
 */

// Type-only imports (no runtime dependency on 'mongodb' package)
type MongoClient = any;
type Db = any;

let mongoClient: MongoClient | null = null;
let database: Db | null = null;

export async function connectMongoDB(): Promise<Db> {
  // Stub implementation - MongoDB is no longer used in production
  console.warn('⚠️  MongoDB connection requested but MongoDB is not available (using stub)');

  if (database) {
    return database;
  }

  // Return a mock database object for compatibility
  database = {
    collection: () => ({
      find: () => ({ toArray: async () => [] }),
      findOne: async () => null,
      insertOne: async () => ({ insertedId: null }),
      updateOne: async () => ({ modifiedCount: 0 }),
      deleteOne: async () => ({ deletedCount: 0 }),
    }),
  };

  return database;
}

export async function getMongoClient(): Promise<MongoClient> {
  if (!mongoClient) {
    mongoClient = {}; // Mock client
  }
  return mongoClient!;
}

export async function getDatabase(): Promise<Db> {
  if (!database) {
    await connectMongoDB();
  }
  return database!;
}

export async function closeMongoDB(): Promise<void> {
  if (mongoClient) {
    mongoClient = null;
    database = null;
    console.log('✅ MongoDB connection closed (stub)');
  }
}
