/**
 * @file src/plugins/unified-data-hub/server/mongodb-client-cache.ts
 * @description Per-connector MongoDB connection cache via mongoose.
 *
 * Features:
 * - Lazy connection per connector
 * - Explicit invalidation on credential updates
 * - Test-only clearAll for isolation
 */

import type mongoose from "mongoose";

const connections = new Map<string, mongoose.Connection>();

export async function getPooledMongoConnection(
  connectorId: string,
  connectionString: string,
  database: string,
): Promise<mongoose.Connection> {
  const existing = connections.get(connectorId);
  if (existing?.readyState === 1) return existing;

  const mongooseMod = await import("mongoose");
  const conn = mongooseMod.default.createConnection(connectionString, {
    dbName: database,
    maxPoolSize: 3,
    serverSelectionTimeoutMS: 10_000,
  });
  await conn.asPromise();
  connections.set(connectorId, conn);
  return conn;
}

export async function invalidateMongoConnection(connectorId: string): Promise<void> {
  const conn = connections.get(connectorId);
  if (!conn) return;
  connections.delete(connectorId);
  try {
    await conn.close();
  } catch {
    /* non-fatal */
  }
}

export async function clearAllMongoConnections(): Promise<void> {
  const ids = [...connections.keys()];
  await Promise.all(ids.map((id) => invalidateMongoConnection(id)));
}
