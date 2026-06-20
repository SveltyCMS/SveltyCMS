/**
 * @file src/databases/postgresql/connection.ts
 * @description PostgreSQL connection management using postgres.js (porsager/postgres)
 *
 * Features:
 * - Connection pooling
 * - SSL support
 * - Connection testing
 * - Graceful shutdown
 */

import { logger } from "@utils/logger";
import postgres from "postgres";

let sql: ReturnType<typeof postgres> | null = null;

export interface ConnectionConfig {
  database: string;
  host: string;
  password: string;
  port: number;
  ssl?: boolean | "require" | "prefer";
  user: string;
}

/**
 * Create and configure PostgreSQL connection
 */
export async function createConnection(
  config: ConnectionConfig,
): Promise<ReturnType<typeof postgres>> {
  if (sql) {
    logger.debug("Reusing existing PostgreSQL connection");
    return sql;
  }

  logger.info("Creating new PostgreSQL connection");

  // Enterprise: respect optional external pooler (PgBouncer) from private config.
  // When pooler in tx mode, prefer prepare:false. Port hint 6432 for standard PgBouncer.
  let effectivePort = config.port;
  let effectivePrepare = true;
  try {
    const { getDbPoolerConfig } = await import("../config-state");
    const p = getDbPoolerConfig();
    if (p.enabled && p.url) {
      // Parse pooler URL for host/port override if full URL provided in future
      try {
        const u = new URL(p.url);
        if (u.port) effectivePort = Number(u.port);
      } catch {}
      if (p.type === "pgbouncer" && (p.mode === "transaction" || !p.mode)) {
        effectivePrepare = p.prepare !== undefined ? !!p.prepare : false;
      } else if (p.prepare !== undefined) {
        effectivePrepare = !!p.prepare;
      }
    }
  } catch {}

  sql = postgres({
    host: config.host,
    port: effectivePort || 6432, // 6432 common for PgBouncer
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: config.ssl === true || config.ssl === "require" ? "require" : undefined,
    max: 100, // Increased for high-concurrency enterprise benchmarks
    idle_timeout: 60, // Idle connection timeout in seconds
    connect_timeout: 30, // Connection timeout in seconds
    prepare: effectivePrepare,
    onnotice: () => {
      /* Suppress notice messages */
    },
    transform: {
      undefined: null, // Transform undefined to null
    },
  });

  // Test the connection
  try {
    await sql`SELECT 1 AS test`;
    logger.info("PostgreSQL connection created successfully");
  } catch (error) {
    logger.error("Failed to create PostgreSQL connection:", error);
    throw error;
  }

  return sql;
}

/**
 * Get the current connection
 */
export function getConnection(): ReturnType<typeof postgres> | null {
  return sql;
}

/**
 * Close the connection
 */
export async function closeConnection(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = null;
    logger.info("PostgreSQL connection closed");
  }
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<{
  success: boolean;
  latency: number;
}> {
  if (!sql) {
    return { success: false, latency: -1 };
  }

  try {
    const start = Date.now();
    await sql`SELECT 1 AS test`;
    const latency = Date.now() - start;
    return { success: true, latency };
  } catch (error) {
    logger.error("Connection test failed:", error);
    return { success: false, latency: -1 };
  }
}
