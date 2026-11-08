/**
 * @file tests/unit/databases/in-memory-provision-lock.test.ts
 * @description A `:memory:` SQLite adapter must provision its own schema even
 *   when the process-wide migration lock is held by another Vitest worker.
 *
 * The lock is a file (`config/database/.migration.lock`) that serialises
 * migrations across processes sharing an on-disk database. A `:memory:` database
 * is private to one process, so the winner's bootstrap never covers the loser —
 * yet `provision()` used to record success without running the migration, and
 * the loser failed later with "no such table: content_drafts".
 *
 * Features:
 * - mocks `withMigrationLock` to simulate a competing worker holding the lock
 * - asserts the drafts lane is usable after `provision()`
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@src/databases/migration-lock", () => ({
  withMigrationLock: vi.fn(async () => false),
}));

import { SQLiteAdapter } from "@src/databases/sqlite/sqlite-adapter";
import type { DatabaseId } from "@src/databases/db-interface";

describe("SQLite in-memory provisioning", () => {
  it("creates the system schema while the file lock is held elsewhere", async () => {
    const adapter = new SQLiteAdapter();
    try {
      const conn = await adapter.connect(":memory:");
      expect(conn.success).toBe(true);

      await adapter.provision();

      const saved = await adapter.content.drafts.upsertDraft(
        {
          authorId: "author-1" as DatabaseId,
          collectionId: "drafts_contract" as DatabaseId,
          data: { title: "lock-safe" },
          tenantId: "tenant-drafts" as DatabaseId,
        },
        { tenantId: "tenant-drafts" as DatabaseId },
      );

      expect(saved.success, JSON.stringify(saved)).toBe(true);
    } finally {
      await adapter.disconnect();
    }
  });
});
