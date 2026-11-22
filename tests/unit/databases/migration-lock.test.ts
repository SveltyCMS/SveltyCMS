/**
 * @file tests/unit/databases/migration-lock.test.ts
 * @description Stale-lock takeover contract for `withMigrationLock`.
 *
 * A migration that crashes between acquire and release used to leave a
 * permanent lock: the Mongo document (and the SQLite file) carried an
 * acquisition timestamp that nothing ever compared, so every later boot
 * skipped the schema bootstrap. These tests pin the TTL contract with a fake
 * clock:
 * - a fresh lock blocks the second instance,
 * - a lock older than 10 minutes is stolen (and the steal is logged),
 * - release still removes only the lock this process owns.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MIGRATION_LOCK_TTL_MS, withMigrationLock } from "@src/databases/migration-lock";
import { logger } from "@utils/logger";

// ─── Mongo fake ───────────────────────────────────────────────────────────────

interface FakeLockDocument {
  _id: string;
  pid: number;
  acquiredAt?: Date;
}

interface FakeMongoAdapter {
  connection?: {
    db?: {
      collection(name: string): unknown;
    };
  };
}

const MONGO_NOW = Date.parse("2026-11-22T12:00:00.000Z");

function createMongoAdapter(initial: FakeLockDocument | null) {
  const state: { doc: FakeLockDocument | null } = { doc: initial ? { ...initial } : null };

  const collection = {
    async insertOne(document: Record<string, unknown>) {
      if (state.doc) {
        const error = new Error("E11000 duplicate key error") as Error & { code: number };
        error.code = 11000;
        throw error;
      }
      state.doc = document as unknown as FakeLockDocument;
      return { acknowledged: true };
    },

    /** Minimal stand-in for the atomic conditional takeover this module issues. */
    async findOneAndUpdate(filter: Record<string, unknown>, update: Record<string, unknown>) {
      if (!state.doc) return null;
      const clauses = (filter.$or ?? []) as Array<{
        acquiredAt?: { $lt?: Date; $exists?: boolean };
      }>;
      const staleBefore = clauses[0]?.acquiredAt?.$lt;
      const allowsMissing = clauses[1]?.acquiredAt?.$exists === false;
      const acquiredAt = state.doc.acquiredAt;
      const stale = acquiredAt
        ? Boolean(staleBefore && acquiredAt.getTime() < staleBefore.getTime())
        : allowsMissing;
      if (!stale) return null;

      state.doc = { ...state.doc, ...(update.$set as Partial<FakeLockDocument>) };
      return { value: { ...state.doc } };
    },

    async deleteOne(filter: Record<string, unknown>) {
      if (state.doc && state.doc._id === filter._id && state.doc.pid === filter.pid) {
        state.doc = null;
        return { deletedCount: 1 };
      }
      return { deletedCount: 0 };
    },
  };

  const adapter: FakeMongoAdapter = {
    connection: { db: { collection: () => collection } },
  };
  return { adapter: adapter as never, state };
}

describe("withMigrationLock — stale MongoDB lock takeover", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks a second instance while the lock is fresh", async () => {
    const { adapter, state } = createMongoAdapter({
      _id: "migration_lock",
      pid: 111,
      acquiredAt: new Date(MONGO_NOW),
    });
    const migrate = vi.fn(async () => {});

    const ran = await withMigrationLock(adapter, "mongodb", migrate, { now: () => MONGO_NOW });

    expect(ran).toBe(false);
    expect(migrate).not.toHaveBeenCalled();
    // The fresh lock keeps its original owner.
    expect(state.doc?.pid).toBe(111);
  });

  it("steals a lock older than the TTL, logs it, and releases it afterwards", async () => {
    const warn = vi.spyOn(logger, "warn");
    const { adapter, state } = createMongoAdapter({
      _id: "migration_lock",
      pid: 111,
      acquiredAt: new Date(MONGO_NOW - MIGRATION_LOCK_TTL_MS - 1000),
    });
    let observedPid: number | undefined;

    const ran = await withMigrationLock(
      adapter,
      "mongodb",
      async () => {
        observedPid = state.doc?.pid;
      },
      { now: () => MONGO_NOW },
    );

    expect(ran).toBe(true);
    expect(observedPid).toBe(process.pid);
    expect(
      warn.mock.calls.some(([message]) => String(message).includes("Stole stale MongoDB")),
    ).toBe(true);
    // `finally` released the lock it stole.
    expect(state.doc).toBeNull();
  });

  it("treats a legacy lock document without acquiredAt as abandoned", async () => {
    const { adapter, state } = createMongoAdapter({ _id: "migration_lock", pid: 111 });
    const migrate = vi.fn(async () => {});

    const ran = await withMigrationLock(adapter, "mongodb", migrate, { now: () => MONGO_NOW });

    expect(ran).toBe(true);
    expect(migrate).toHaveBeenCalledTimes(1);
    expect(state.doc).toBeNull();
  });

  it("does not steal a lock exactly at the TTL boundary", async () => {
    const { adapter, state } = createMongoAdapter({
      _id: "migration_lock",
      pid: 111,
      acquiredAt: new Date(MONGO_NOW - MIGRATION_LOCK_TTL_MS),
    });
    const migrate = vi.fn(async () => {});

    const ran = await withMigrationLock(adapter, "mongodb", migrate, { now: () => MONGO_NOW });

    expect(ran).toBe(false);
    expect(migrate).not.toHaveBeenCalled();
    expect(state.doc?.pid).toBe(111);
  });
});

// ─── SQLite file lock ─────────────────────────────────────────────────────────

describe("withMigrationLock — stale SQLite file lock takeover", () => {
  let directory: string;
  let lockFile: string;

  beforeEach(() => {
    // Never touch the live `config/database` directory from a test.
    directory = mkdtempSync(join(tmpdir(), "svelty-migration-lock-"));
    lockFile = join(directory, ".migration.lock");
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("blocks while the lock file is fresh", async () => {
    writeFileSync(lockFile, "999999");
    const migrate = vi.fn(async () => {});

    const ran = await withMigrationLock({} as never, "sqlite", migrate, {
      sqliteLockPath: lockFile,
    });

    expect(ran).toBe(false);
    expect(migrate).not.toHaveBeenCalled();
    expect(existsSync(lockFile)).toBe(true);
  });

  it("steals a stale lock file (fake clock past the TTL) and removes it on release", async () => {
    writeFileSync(lockFile, "999999");
    const future = Date.now() + MIGRATION_LOCK_TTL_MS + 60_000;
    let ownedDuringMigration = false;

    const ran = await withMigrationLock(
      {} as never,
      "sqlite",
      async () => {
        ownedDuringMigration = existsSync(lockFile);
      },
      { now: () => future, sqliteLockPath: lockFile },
    );

    expect(ran).toBe(true);
    expect(ownedDuringMigration).toBe(true);
    expect(existsSync(lockFile)).toBe(false);
  });

  it("creates and releases its own lock on a normal run", async () => {
    let ownedDuringMigration = false;

    const ran = await withMigrationLock(
      {} as never,
      "sqlite",
      async () => {
        ownedDuringMigration = existsSync(lockFile);
      },
      { sqliteLockPath: lockFile },
    );

    expect(ran).toBe(true);
    expect(ownedDuringMigration).toBe(true);
    expect(existsSync(lockFile)).toBe(false);
  });

  it("does not delete a lock that a successor process took over", async () => {
    // Release reads the file owner; a process that overran the TTL must not
    // unlink the successor's lock when it finally returns.
    const ran = await withMigrationLock(
      {} as never,
      "sqlite",
      async () => {
        writeFileSync(lockFile, "424242");
      },
      { sqliteLockPath: lockFile },
    );

    expect(ran).toBe(true);
    expect(existsSync(lockFile)).toBe(true);
  });
});
