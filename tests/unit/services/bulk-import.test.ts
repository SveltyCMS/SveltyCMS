/**
 * @file tests/unit/services/bulk-import.test.ts
 * @description Bulk collection import uses findByIds / insertMany / upsertMany, not N findOne.
 *
 * Features tested:
 * - skip: one findByIds then insertMany of missing rows
 * - overwrite: upsertMany for documents with _id
 * - replace: deleteMany then insertMany
 */

import { describe, expect, it, vi } from "vitest";
import { bulkImportCollectionDocuments } from "@src/services/background/jobs/import-jobs";
import type { IDBAdapter } from "@src/databases/db-interface";

function mockAdapter(overrides: {
  findByIds?: ReturnType<typeof vi.fn>;
  insertMany?: ReturnType<typeof vi.fn>;
  upsertMany?: ReturnType<typeof vi.fn>;
  deleteMany?: ReturnType<typeof vi.fn>;
}): IDBAdapter {
  return {
    crud: {
      findByIds: overrides.findByIds ?? vi.fn().mockResolvedValue({ success: true, data: [] }),
      insertMany: overrides.insertMany ?? vi.fn().mockResolvedValue({ success: true, data: [] }),
      upsertMany: overrides.upsertMany ?? vi.fn().mockResolvedValue({ success: true, data: [] }),
      deleteMany:
        overrides.deleteMany ??
        vi.fn().mockResolvedValue({ success: true, data: { deletedCount: 0 } }),
    },
  } as unknown as IDBAdapter;
}

describe("bulkImportCollectionDocuments", () => {
  it("skip strategy: findByIds once, insertMany only missing ids", async () => {
    const findByIds = vi.fn().mockResolvedValue({
      success: true,
      data: [{ _id: "keep-me" }],
    });
    const insertMany = vi.fn().mockResolvedValue({ success: true, data: [] });
    const upsertMany = vi.fn();
    const adapter = mockAdapter({ findByIds, insertMany, upsertMany });

    const tally = await bulkImportCollectionDocuments(adapter, {
      collectionName: "Posts",
      data: [
        { _id: "keep-me", title: "Existing" },
        { _id: "new-1", title: "New" },
        { title: "No id" },
      ],
      duplicateStrategy: "skip",
      tenantId: "t1",
    });

    expect(findByIds).toHaveBeenCalledTimes(1);
    expect(upsertMany).not.toHaveBeenCalled();
    expect(insertMany).toHaveBeenCalledTimes(1);
    const inserted = insertMany.mock.calls[0][1] as Array<{ _id?: string }>;
    expect(inserted.map((d) => d._id)).toEqual(["new-1", undefined]);
    expect(tally.skipped).toBe(1);
    expect(tally.imported).toBe(2);
  });

  it("overwrite strategy: upsertMany for ids, insertMany for rows without _id", async () => {
    const upsertMany = vi.fn().mockResolvedValue({ success: true, data: [] });
    const insertMany = vi.fn().mockResolvedValue({ success: true, data: [] });
    const findByIds = vi.fn();
    const adapter = mockAdapter({ upsertMany, insertMany, findByIds });

    const tally = await bulkImportCollectionDocuments(adapter, {
      collectionName: "Posts",
      data: [{ _id: "a", title: "A" }, { title: "B" }],
      duplicateStrategy: "overwrite",
      tenantId: "t1",
    });

    expect(findByIds).not.toHaveBeenCalled();
    expect(upsertMany).toHaveBeenCalledTimes(1);
    expect(insertMany).toHaveBeenCalledTimes(1);
    expect(tally.imported).toBe(2);
  });

  it("replace mode: deleteMany then insertMany (no per-row upsert)", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ success: true, data: { deletedCount: 3 } });
    const insertMany = vi.fn().mockResolvedValue({ success: true, data: [] });
    const upsertMany = vi.fn();
    const adapter = mockAdapter({ deleteMany, insertMany, upsertMany });

    await bulkImportCollectionDocuments(adapter, {
      collectionName: "Posts",
      data: [{ _id: "a" }, { _id: "b" }],
      mode: "replace",
      duplicateStrategy: "overwrite",
      tenantId: "t1",
    });

    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(insertMany).toHaveBeenCalledTimes(1);
    expect(upsertMany).not.toHaveBeenCalled();
  });
});
