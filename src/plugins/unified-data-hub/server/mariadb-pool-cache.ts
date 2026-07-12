/**
 * @file src/plugins/unified-data-hub/server/mariadb-pool-cache.ts
 * @description Per-connector MariaDB connection pool cache.
 *
 * Features:
 * - Lazy pool creation per connector
 * - Explicit invalidation on credential updates
 * - Test-only clearAll for isolation
 */

import type { Pool, PoolOptions } from "mysql2/promise";

const pools = new Map<string, Pool>();

export async function getPooledMariaDb(connectorId: string, options: PoolOptions): Promise<Pool> {
  const existing = pools.get(connectorId);
  if (existing) return existing;

  const mysql = await import("mysql2/promise");
  const pool = mysql.createPool({ ...options, waitForConnections: true, connectionLimit: 3 });
  pools.set(connectorId, pool);
  return pool;
}

export async function invalidateMariaDbPool(connectorId: string): Promise<void> {
  const pool = pools.get(connectorId);
  if (!pool) return;
  pools.delete(connectorId);
  try {
    await pool.end();
  } catch {
    /* non-fatal */
  }
}

export async function clearAllMariaDbPools(): Promise<void> {
  const ids = [...pools.keys()];
  await Promise.all(ids.map((id) => invalidateMariaDbPool(id)));
}
