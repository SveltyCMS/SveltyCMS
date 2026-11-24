/**
 * @file tests/unit/databases/sqlite-wal-truncate.test.ts
 * @description Proves the shutdown WAL checkpoint actually empties the file.
 *
 * The shutdown hook (`src/server/wal-shutdown.ts`) asks for `TRUNCATE` instead of
 * the periodic housekeeping's `PASSIVE`. `PASSIVE` writes frames back but leaves
 * the `-wal` at its high-water mark; only `TRUNCATE` resets the file. This test
 * measures the file, so a future refactor that swaps the mode back cannot pass
 * silently.
 *
 * Writes go through the synchronous `prepareAndExecute` path on purpose: the
 * batched writer (`prepareAndExecuteWrite`) needs a live batcher, and tearing the
 * adapter down with queued jobs leaves unhandled rejections behind.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, rmSync } from "node:fs";

const DIR = "config/test-database";
const DB_PATH = `${DIR}/sveltycms_wal_truncate.sqlite`;
const SIDE_FILES = [`${DB_PATH}-wal`, `${DB_PATH}-shm`];

describe("SQLite WAL truncation", () => {
  let db: any;

  beforeAll(async () => {
    mkdirSync(DIR, { recursive: true });
    for (const file of [DB_PATH, ...SIDE_FILES]) rmSync(file, { force: true });

    const { SQLiteAdapter } = await import("../../../src/databases/sqlite/sqlite-adapter");
    db = new SQLiteAdapter() as any;
    const result = await db.connect(DB_PATH);
    if (!result.success) throw new Error(result.message);

    db.prepareAndExecute(
      "CREATE TABLE IF NOT EXISTS wal_probe (id INTEGER PRIMARY KEY, v TEXT)",
      "run",
    );
  });

  afterAll(async () => {
    try {
      if (db?.isConnected?.()) await db.disconnect();
    } finally {
      for (const file of [DB_PATH, ...SIDE_FILES]) rmSync(file, { force: true });
    }
  });

  it("TRUNCATE empties a WAL that holds frames", () => {
    const payload = "x".repeat(512);
    for (let i = 0; i < 400; i++) {
      db.prepareAndExecute("INSERT INTO wal_probe (v) VALUES (?)", "run", `${i}-${payload}`);
    }

    const before = db.getWalSizeBytes();
    expect(before, "the WAL must hold frames before the checkpoint is meaningful").toBeGreaterThan(
      0,
    );

    const result = db.runWalCheckpoint("TRUNCATE");
    const after = db.getWalSizeBytes();

    expect(result.success).toBe(true);
    expect(result.busy, "a lone connection cannot leave the WAL busy").toBe(false);
    expect(after, `TRUNCATE must reset the WAL (before ${before} B, after ${after} B)`).toBe(0);
  });
});
