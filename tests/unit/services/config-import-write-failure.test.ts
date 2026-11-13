/**
 * @file tests/unit/services/config-import-write-failure.test.ts
 * @description Proves `ConfigService.performImport()` surfaces a rejected write.
 *
 * `upsertEntity` / `deleteEntity` used to catch every error (and ignore the
 * adapter's `{ success: false }` result), so `performImport` always resolved:
 * `POST /api/config/apply` answered `{ success: true }` and the config CLI's
 * "❌ Import failed" branch was unreachable even when nothing was written.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUpsert, mockDelete } = vi.hoisted(() => ({
  mockUpsert: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    type: "sqlite",
    crud: { upsert: mockUpsert, delete: mockDelete },
    auth: {},
    system: {},
  },
  getDb: vi.fn(() => null),
}));

import { ConfigService } from "@src/services/core/config-service";

function collectionEntity(uuid: string, name: string) {
  return {
    uuid,
    type: "collection" as const,
    name,
    hash: `hash-${uuid}`,
    entity: { _id: uuid, name },
  };
}

describe("ConfigService.performImport() failure signalling", () => {
  beforeEach(() => {
    mockUpsert.mockReset();
    mockDelete.mockReset();
  });

  it("rejects when the adapter reports the write as unsuccessful", async () => {
    mockUpsert.mockResolvedValue({
      success: false,
      message: "write rejected",
      error: { code: "WRITE_FAILED", message: "write rejected" },
    });

    const service = new ConfigService();
    await expect(
      service.performImport({
        tenantId: "tenant-1",
        changes: { new: [collectionEntity("c1", "blog")], updated: [], deleted: [] },
      }),
    ).rejects.toThrow(/blog/i);
  });

  it("rejects when the adapter throws", async () => {
    mockUpsert.mockRejectedValue(new Error("connection lost"));

    const service = new ConfigService();
    await expect(
      service.performImport({
        tenantId: "tenant-1",
        changes: { new: [collectionEntity("c1", "blog")], updated: [], deleted: [] },
      }),
    ).rejects.toThrow(/connection lost/i);
  });

  it("rejects when a delete is not applied", async () => {
    mockDelete.mockResolvedValue({ success: false, message: "row not deleted" });

    const service = new ConfigService();
    await expect(
      service.performImport({
        tenantId: "tenant-1",
        changes: { new: [], updated: [], deleted: [collectionEntity("c2", "stale")] },
      }),
    ).rejects.toThrow(/stale/i);
  });

  it("resolves when every write is applied", async () => {
    mockUpsert.mockResolvedValue({ success: true });
    mockDelete.mockResolvedValue({ success: true });

    const service = new ConfigService();
    await expect(
      service.performImport({
        tenantId: "tenant-1",
        changes: {
          new: [collectionEntity("c1", "blog")],
          updated: [],
          deleted: [collectionEntity("c2", "stale")],
        },
      }),
    ).resolves.toBeUndefined();
  });
});
