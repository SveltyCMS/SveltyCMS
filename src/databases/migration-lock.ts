/**
 * @file src/databases/migration-lock.ts
 * @description
 * Prevents concurrent schema migrations across multiple server instances.
 * Uses database-specific advisory locks to ensure only one process runs migrations.
 *
 * ### Features:
 * - PostgreSQL: `pg_try_advisory_lock` (non-blocking)
 * - MariaDB: `GET_LOCK` with timeout 0 (non-blocking)
 * - SQLite: File-based exclusive lock
 * - MongoDB: Unique document in `_migrations_lock` collection
 *
 * ### Usage:
 * ```typescript
 * const ran = await withMigrationLock(adapter, "sqlite", async () => {
 *   await runMigrations();
 * });
 * ```
 */

import { logger } from "@utils/logger";
import type { DatabaseAdapter } from "./db-interface";

const MIGRATION_LOCK_KEY = 0x5f6c7463; // "svelty" as int

/**
 * Acquires an advisory lock and executes the migration function.
 * Returns true if migrations ran, false if another process already holds the lock.
 */
export async function withMigrationLock(
  adapter: DatabaseAdapter,
  dbType: string,
  migrateFn: () => Promise<void>,
): Promise<boolean> {
  logger.info(`[MigrationLock] Attempting to acquire lock for ${dbType}...`);

  let acquired = false;

  try {
    if (dbType === "postgresql") {
      acquired = await tryPostgresLock(adapter);
    } else if (dbType === "mariadb" || dbType === "mysql") {
      acquired = await tryMariaDBLock(adapter);
    } else if (dbType === "sqlite") {
      acquired = await trySQLiteLock();
    } else if (dbType === "mongodb") {
      acquired = await tryMongoLock(adapter);
    } else {
      // Unknown adapter — run migrations without lock (best effort)
      logger.warn(`[MigrationLock] Unknown DB type "${dbType}", running without lock`);
      await migrateFn();
      return true;
    }

    if (!acquired) {
      logger.info(
        `[MigrationLock] Another instance is running migrations for ${dbType}. Skipping.`,
      );
      return false;
    }

    logger.info(`[MigrationLock] Lock acquired. Running migrations for ${dbType}...`);
    await migrateFn();
    return true;
  } catch (err) {
    logger.error(`[MigrationLock] Migration failed for ${dbType}:`, err);
    return false;
  } finally {
    if (acquired) {
      await releaseLock(adapter, dbType);
    }
  }
}

async function tryPostgresLock(adapter: DatabaseAdapter): Promise<boolean> {
  try {
    const raw = (adapter as any).getClient?.() || (adapter as any).pool || (adapter as any).sql;
    if (!raw) return true; // No raw client — run anyway (single-instance env)

    const result = await raw`SELECT pg_try_advisory_lock(${MIGRATION_LOCK_KEY}) as acquired`;
    return result[0]?.acquired === true;
  } catch {
    return true; // Lock not supported — run anyway
  }
}

async function tryMariaDBLock(adapter: DatabaseAdapter): Promise<boolean> {
  try {
    const raw =
      (adapter as any).getClient?.() || (adapter as any).pool || (adapter as any).connection;
    if (!raw) return true;

    const [rows] = await raw.execute("SELECT GET_LOCK('sveltycms_migration', 0) as acquired");
    return rows?.[0]?.acquired === 1;
  } catch {
    return true;
  }
}

async function trySQLiteLock(): Promise<boolean> {
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const lockFile = path.join(process.cwd(), "config", "database", ".migration.lock");

    // Try to create the lock file exclusively
    const fd = fs.openSync(lockFile, "wx");
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
    return true;
  } catch (err: any) {
    if (err?.code === "EEXIST") return false; // Lock file already exists
    return true; // Lock not supported — run anyway
  }
}

async function tryMongoLock(adapter: DatabaseAdapter): Promise<boolean> {
  try {
    const conn = (adapter as any).connection;
    if (!conn?.db) return true;

    const db = conn.db;
    const collection = db.collection("_migrations_lock");

    // Insert a lock document — MongoDB's unique _id constraint ensures only one succeeds
    await collection.insertOne({
      _id: "migration_lock",
      pid: process.pid,
      acquiredAt: new Date(),
    });
    return true;
  } catch (err: any) {
    if (err?.code === 11000) return false; // Duplicate key — lock already held
    return true; // Lock not supported — run anyway
  }
}

async function releaseLock(adapter: DatabaseAdapter, dbType: string): Promise<void> {
  try {
    if (dbType === "postgresql") {
      const raw = (adapter as any).getClient?.() || (adapter as any).pool || (adapter as any).sql;
      if (raw) await raw`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY})`;
    } else if (dbType === "mariadb" || dbType === "mysql") {
      const raw =
        (adapter as any).getClient?.() || (adapter as any).pool || (adapter as any).connection;
      if (raw) await raw.execute("SELECT RELEASE_LOCK('sveltycms_migration')");
    } else if (dbType === "sqlite") {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const lockFile = path.join(process.cwd(), "config", "database", ".migration.lock");
      try {
        fs.unlinkSync(lockFile);
      } catch {
        /* already released */
      }
    } else if (dbType === "mongodb") {
      const conn = (adapter as any).connection;
      if (conn?.db) {
        await conn.db
          .collection("_migrations_lock")
          .deleteOne({ _id: "migration_lock", pid: process.pid });
      }
    }
  } catch {
    // Best-effort release
  }
}
