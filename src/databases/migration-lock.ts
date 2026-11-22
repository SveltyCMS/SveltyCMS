/**
 * @file src/databases/migration-lock.ts
 * @description
 * Prevents concurrent schema migrations across multiple server instances.
 * Uses database-specific advisory locks to ensure only one process runs migrations.
 *
 * ### Features:
 * - PostgreSQL: `pg_try_advisory_lock` (non-blocking)
 * - MariaDB: `GET_LOCK` with timeout 0 (non-blocking)
 * - SQLite: File-based exclusive lock with a stale-TTL takeover
 * - MongoDB: Unique document in `_migrations_lock` with a stale-TTL takeover
 * - Stale locks (a crashed migration) are stolen after `MIGRATION_LOCK_TTL_MS`
 *   instead of blocking every later boot forever
 *
 * ### Usage:
 * ```typescript
 * const ran = await withMigrationLock(adapter, "sqlite", async () => {
 *   await bootstrapSystemSchema("sqlite", connection);
 * });
 * ```
 */

import { logger } from "@utils/logger";
import type { DatabaseAdapter } from "./db-interface";

const MIGRATION_LOCK_KEY = 0x5f6c7463; // "svelty" as int

/** Mongo lock document id — one per cluster/database. */
const MONGO_LOCK_ID = "migration_lock";

/** Mongo collection holding the lock document. */
const MONGO_LOCK_COLLECTION = "_migrations_lock";

/**
 * A lock older than this is treated as abandoned. A migration that crashes
 * between acquire and release (process kill, OOM, deploy restart) leaves the
 * lock behind; without a TTL that lock is permanent and every later boot skips
 * the schema bootstrap. Ten minutes is far longer than a normal schema
 * bootstrap yet short enough that a crash-looping deployment recovers within
 * one deploy window.
 */
export const MIGRATION_LOCK_TTL_MS = 10 * 60 * 1000;

/**
 * Injection points for tests and embedded runtimes. Production callers omit
 * them: the clock is `Date.now`, the TTL is {@link MIGRATION_LOCK_TTL_MS} and
 * the SQLite lock lives in `config/database/.migration.lock`.
 */
export interface MigrationLockOptions {
  /** Clock override — stale-lock tests run on a fake clock. */
  now?: () => number;
  /** Stale TTL override in milliseconds. */
  ttlMs?: number;
  /** Absolute SQLite lock file path (tests must never touch the live config dir). */
  sqliteLockPath?: string;
}

/** Minimal structural view of the Mongo connection used by the lock. */
interface MongoLockCollection {
  insertOne(document: Record<string, unknown>): Promise<unknown>;
  findOneAndUpdate(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
  deleteOne(filter: Record<string, unknown>): Promise<unknown>;
}

interface MongoLockConnection {
  connection?: {
    db?: {
      collection(name: string): MongoLockCollection;
    };
  };
}

/** Driver error shape for the duplicate-key / OS error checks below. */
interface CodedError {
  code?: string | number;
}

/** Extracts the `code` from a thrown driver/OS error without narrowing to `any`. */
function errorCode(error: unknown): string | number | undefined {
  if (!error || typeof error !== "object") return undefined;
  return (error as CodedError).code;
}

/**
 * Acquires an advisory lock and executes the migration function.
 * Returns true if migrations ran, false if another process already holds the lock.
 */
export async function withMigrationLock(
  adapter: DatabaseAdapter,
  dbType: string,
  migrateFn: () => Promise<void>,
  options: MigrationLockOptions = {},
): Promise<boolean> {
  // Chatty on purpose-low value: the schema-bootstrap outcome line is the user-facing
  // one; the lock handshake only matters when it is contested (kept at info below).
  logger.debug(`[MigrationLock] Attempting to acquire lock for ${dbType}...`);

  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? MIGRATION_LOCK_TTL_MS;
  let acquired = false;

  try {
    if (dbType === "postgresql") {
      acquired = await tryPostgresLock(adapter);
    } else if (dbType === "mariadb" || dbType === "mysql") {
      acquired = await tryMariaDBLock(adapter);
    } else if (dbType === "sqlite") {
      acquired = await trySQLiteLock(now(), ttlMs, options.sqliteLockPath);
    } else if (dbType === "mongodb") {
      acquired = await tryMongoLock(adapter, now(), ttlMs);
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

    logger.debug(`[MigrationLock] Lock acquired. Running migrations for ${dbType}...`);
    await migrateFn();
    return true;
  } catch (err) {
    logger.error(`[MigrationLock] Migration failed for ${dbType}:`, err);
    return false;
  } finally {
    if (acquired) {
      await releaseLock(adapter, dbType, options.sqliteLockPath);
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

/** Default lock file — live configuration, never used by tests (pass `sqliteLockPath`). */
async function sqliteLockFilePath(): Promise<string> {
  const path = await import("node:path");
  return path.join(process.cwd(), "config", "database", ".migration.lock");
}

/**
 * Creates the lock file exclusively. Returns `true` when this process now owns
 * it, `false` when another process does, and `true` when the filesystem does not
 * support the lock (the historical best-effort behavior).
 */
async function createSQLiteLockFile(lockFile: string): Promise<boolean> {
  const fs = await import("node:fs");
  try {
    const fd = fs.openSync(lockFile, "wx");
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
    return true;
  } catch (error) {
    if (errorCode(error) === "EEXIST") return false;
    return true; // Lock not supported — run anyway
  }
}

async function trySQLiteLock(
  nowMs: number,
  ttlMs: number,
  lockPathOverride?: string,
): Promise<boolean> {
  const fs = await import("node:fs");
  const lockFile = lockPathOverride ?? (await sqliteLockFilePath());

  if (await createSQLiteLockFile(lockFile)) return true;

  // The lock file exists. It is fresh while another instance is migrating, and
  // stale only when a previous holder crashed before unlinking it.
  let ageMs: number;
  try {
    ageMs = nowMs - fs.statSync(lockFile).mtimeMs;
  } catch {
    // The holder released between EEXIST and stat — retry the exclusive create.
    return createSQLiteLockFile(lockFile);
  }
  if (ageMs <= ttlMs) return false;

  try {
    fs.unlinkSync(lockFile);
  } catch (error) {
    // A racing process already removed it; either way the next create decides.
    if (errorCode(error) !== "ENOENT") return false;
  }

  const acquired = await createSQLiteLockFile(lockFile);
  if (acquired) {
    logger.warn(
      `[MigrationLock] Stole stale SQLite migration lock (age ${Math.round(ageMs / 1000)}s > ttl ${Math.round(ttlMs / 1000)}s)`,
    );
  }
  return acquired;
}

async function tryMongoLock(
  adapter: DatabaseAdapter,
  nowMs: number,
  ttlMs: number,
): Promise<boolean> {
  const connection = (adapter as unknown as MongoLockConnection).connection;
  if (!connection?.db) return true;

  let collection: MongoLockCollection;
  try {
    collection = connection.db.collection(MONGO_LOCK_COLLECTION);
  } catch {
    return true; // Lock not supported — run anyway
  }
  const acquiredAt = new Date(nowMs);

  try {
    // MongoDB's unique `_id` constraint ensures only one insert succeeds.
    await collection.insertOne({ _id: MONGO_LOCK_ID, pid: process.pid, acquiredAt });
    return true;
  } catch (error) {
    if (errorCode(error) !== 11000) return true; // Lock not supported — run anyway
  }

  // A lock document exists. Take it over only when its `acquiredAt` is older
  // than the TTL: the conditional update is atomic, so exactly one contender
  // wins the stale lock and the rest see a fresh timestamp.
  const staleBefore = new Date(nowMs - ttlMs);
  let stolenPid: unknown;
  try {
    const result = await collection.findOneAndUpdate(
      {
        _id: MONGO_LOCK_ID,
        $or: [{ acquiredAt: { $lt: staleBefore } }, { acquiredAt: { $exists: false } }],
      },
      { $set: { pid: process.pid, acquiredAt } },
      { returnDocument: "after" },
    );
    const modified = unwrapMongoResult(result);
    if (!modified) return false; // Fresh lock — another instance is migrating
    stolenPid = modified.pid;
  } catch (error) {
    // We know a lock exists but cannot prove it stale; running concurrently
    // would be worse than skipping this boot.
    logger.warn("[MigrationLock] Could not inspect the MongoDB migration lock; skipping", error);
    return false;
  }

  logger.warn(
    `[MigrationLock] Stole stale MongoDB migration lock (previous holder pid ${String(stolenPid ?? "unknown")})`,
  );
  return true;
}

/**
 * `findOneAndUpdate` returns the modified document directly on driver ≥ 6 and
 * a `{ value }` wrapper on older/mongoose-wrapped paths — accept both.
 */
function unwrapMongoResult(result: unknown): { pid?: unknown } | null {
  if (!result || typeof result !== "object") return null;
  const wrapped = result as { value?: unknown };
  const document = wrapped.value ?? result;
  return document && typeof document === "object" ? (document as { pid?: unknown }) : null;
}

async function releaseLock(
  adapter: DatabaseAdapter,
  dbType: string,
  sqliteLockPath?: string,
): Promise<void> {
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
      const lockFile = sqliteLockPath ?? (await sqliteLockFilePath());
      try {
        // Conditional release: a process that overran the TTL may have lost the
        // lock to a successor, and must never delete the successor's file.
        const owner = fs.readFileSync(lockFile, "utf8").trim();
        if (owner && owner !== String(process.pid)) return;
        fs.unlinkSync(lockFile);
      } catch (error) {
        // Already released (ENOENT) or unreadable — best effort.
        logger.debug("[MigrationLock] SQLite lock release skipped", error);
      }
    } else if (dbType === "mongodb") {
      const connection = (adapter as unknown as MongoLockConnection).connection;
      if (connection?.db) {
        await connection.db
          .collection(MONGO_LOCK_COLLECTION)
          .deleteOne({ _id: MONGO_LOCK_ID, pid: process.pid });
      }
    }
  } catch (error) {
    // Best-effort release — the TTL reclaims the lock if this fails.
    logger.debug("[MigrationLock] Lock release failed", error);
  }
}
