/**
 * @file src/plugins/unified-data-hub/server/postgres-pool-cache.ts
 * @description Per-connector Postgres connection pool cache (v1.5 P1).
 *
 * Avoids pool create/teardown churn on every virtual read (~5–15ms per query).
 * Pools are keyed by connectorId and invalidated on connector credential updates.
 *
 * Features:
 * - Lazy pool creation per connector
 * - Explicit invalidation on save/delete
 * - Test-only clearAll for isolation
 */

import postgres from "postgres";
import type { Sql } from "postgres";

const pools = new Map<string, Sql>();

const POOL_OPTIONS = {
  max: 3,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false as const,
};

export function getPooledPostgres(connectorId: string, connectionString: string): Sql {
  const existing = pools.get(connectorId);
  if (existing) return existing;

  const sql = postgres(connectionString, POOL_OPTIONS);
  pools.set(connectorId, sql);
  return sql;
}

export async function invalidatePostgresPool(connectorId: string): Promise<void> {
  const pool = pools.get(connectorId);
  if (!pool) return;
  pools.delete(connectorId);
  try {
    await pool.end({ timeout: 5 });
  } catch {
    /* non-fatal */
  }
}

export async function clearAllPostgresPools(): Promise<void> {
  const ids = [...pools.keys()];
  await Promise.all(ids.map((id) => invalidatePostgresPool(id)));
}

export function getPostgresPoolStats(): { activePools: number; connectorIds: string[] } {
  return { activePools: pools.size, connectorIds: [...pools.keys()] };
}
