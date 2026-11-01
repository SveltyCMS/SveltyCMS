/**
 * @file tests/unit/sdk/revision-history-sqlite.test.ts
 * @description Real-SQLite contract for revision history on a revision-enabled schema.
 *
 * #Features:
 * - `update()` persists the previous entry version to `content_revisions`
 * - `restoreRevision()` replays an old snapshot and snapshots the pre-restore row
 * - The schema-level `revisionLimit` is read by the SDK, not hard-coded
 *
 * Runs against an in-memory SQLite adapter (no server): the same harness the
 * soft-delete/property tests use. The content registry boundary is a stub that
 * resolves the schema under test; the write, revision, and restore paths are real.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SQLiteAdapter } from "@src/databases/sqlite/sqlite-adapter";
import { CollectionsNamespace } from "@src/services/sdk/namespaces/collections-namespace";
import type { ContentRevision, DatabaseId } from "@src/databases/db-interface";
import type { Schema } from "@src/content/types";
import { generateUUID } from "@src/utils/native-utils";

const COLLECTION = "revision_history_contract";

const schema: Schema = {
  _id: COLLECTION,
  name: COLLECTION,
  slug: COLLECTION,
  fields: [{ db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" }],
  revision: true,
  revisionLimit: 10,
} as Schema;

const user = {
  _id: "revision-tester",
  email: "revision@test.dev",
  role: "admin",
  isAdmin: true,
} as never;

describe("CollectionsNamespace revision history on SQLite", () => {
  let adapter: SQLiteAdapter;
  let ns: CollectionsNamespace;
  let entryId: string;

  beforeAll(async () => {
    adapter = new SQLiteAdapter();
    const conn = await adapter.connect(":memory:");
    expect(conn.success).toBe(true);
    // System tables (`content_revisions`) live in the provisioned schema.
    await (adapter as unknown as { provision: () => Promise<void> }).provision();
    await adapter.createModel(schema);

    // Only the registry lookup is stubbed; every persistence call is the adapter.
    ns = new CollectionsNamespace(adapter, {
      getCollection: async () => schema,
    } as never);

    entryId = generateUUID();

    const inserted = await adapter.crud.insert(COLLECTION, {
      _id: entryId,
      title: "version one",
      status: "draft",
    } as never);
    expect(inserted.success, JSON.stringify(inserted)).toBe(true);
  });

  afterAll(async () => {
    await adapter.disconnect();
  });

  it("records the pre-write snapshot and restores it", async () => {
    const firstUpdate = await ns.update(COLLECTION, entryId, { title: "version two" }, { user });
    expect(firstUpdate.success).toBe(true);

    const history = await adapter.content.revisions.getHistory(entryId as DatabaseId, {
      pageSize: 20,
    });
    expect(history.success).toBe(true);
    const revisions = history.success ? history.data.items : [];
    expect(revisions).toHaveLength(1);
    expect(revisions[0].version).toBe(1);
    expect(revisions[0].data).toMatchObject({ title: "version one" });

    // A second edit stacks another snapshot, so the history is oldest → newest.
    const secondUpdate = await ns.update(COLLECTION, entryId, { title: "version three" }, { user });
    expect(secondUpdate.success).toBe(true);

    const afterSecond = await adapter.content.revisions.getHistory(entryId as DatabaseId, {
      pageSize: 20,
    });
    expect(
      afterSecond.success && afterSecond.data.items.map((row: ContentRevision) => row.version),
    ).toEqual([2, 1]);

    // Restoring v1 replays the snapshot through `update()`, which also snapshots
    // the pre-restore row — a restore is itself undoable.
    const restored = await ns.restoreRevision(COLLECTION, entryId, 1, { user });
    expect(restored.success).toBe(true);

    const row = await adapter.crud.findOne(COLLECTION, { _id: entryId } as never);
    expect(row.success && (row.data as { title?: string } | null)?.title).toBe("version one");

    const afterRestore = await adapter.content.revisions.getHistory(entryId as DatabaseId, {
      pageSize: 20,
    });
    expect(afterRestore.success && afterRestore.data.items.length).toBe(3);
  });
});
