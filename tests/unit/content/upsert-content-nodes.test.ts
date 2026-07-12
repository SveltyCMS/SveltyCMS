/**
 * @file tests/unit/content/upsert-content-nodes.test.ts
 * @description Unit tests for contentService.upsertContentNodes operation routing.
 *
 * Verifies move/rename/create/update paths reach bulkUpdate and delete paths reach deleteMany.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const bulkUpdate = vi.fn().mockResolvedValue({ success: true });
const deleteMany = vi.fn().mockResolvedValue({ success: true });
const updateVersion = vi.fn();

vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    content: {
      nodes: {
        bulkUpdate,
        deleteMany,
      },
    },
  },
}));

vi.mock("@stores/content-registry.svelte", () => ({
  contentStore: {
    updateVersion,
    sync: vi.fn(),
    clear: vi.fn(),
    upsert: vi.fn(),
  },
}));

describe("contentService.upsertContentNodes", () => {
  let contentService: {
    upsertContentNodes: (operations: unknown[], tenantId?: string | null) => Promise<void>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@src/content/engine.server");
    contentService = mod.contentService;
  });

  it("routes create, update, move, and rename operations to bulkUpdate", async () => {
    await contentService.upsertContentNodes(
      [
        {
          type: "create",
          node: { _id: "a", path: "/collection/a", name: "A", nodeType: "collection" },
        },
        {
          type: "move",
          node: { _id: "b", path: "/collection/b", parentId: "cat-1", order: 2 },
        },
        {
          type: "rename",
          node: { _id: "c", path: "/collection/c", name: "Renamed" },
        },
      ],
      "global",
    );

    expect(bulkUpdate).toHaveBeenCalledTimes(1);
    expect(bulkUpdate.mock.calls[0][0]).toHaveLength(3);
    expect(deleteMany).not.toHaveBeenCalled();
    expect(updateVersion).toHaveBeenCalled();
  });

  it("routes delete operations to deleteMany", async () => {
    await contentService.upsertContentNodes(
      [
        {
          type: "delete",
          node: { path: "/collection/removed" },
        },
      ],
      "global",
    );

    expect(deleteMany).toHaveBeenCalledWith(["/collection/removed"], { tenantId: "global" });
    expect(bulkUpdate).not.toHaveBeenCalled();
  });

  it("handles mixed upsert and delete in one batch", async () => {
    await contentService.upsertContentNodes(
      [
        {
          type: "move",
          node: { _id: "posts", path: "/collection/posts", order: 1 },
        },
        {
          type: "delete",
          node: { path: "/collection/stale" },
        },
      ],
      null,
    );

    expect(bulkUpdate).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith(["/collection/stale"], { tenantId: null });
  });

  it("no-ops when operations array is empty", async () => {
    await contentService.upsertContentNodes([], "global");

    expect(bulkUpdate).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(updateVersion).not.toHaveBeenCalled();
  });

  it("throws when bulkUpdate returns success: false (fail-closed)", async () => {
    bulkUpdate.mockResolvedValueOnce({
      success: false,
      message: "TRANSACTION_FAILED",
      error: { code: "TRANSACTION_FAILED", message: "UNIQUE constraint failed" },
    });

    await expect(
      contentService.upsertContentNodes(
        [
          {
            type: "create",
            node: { _id: "x", path: "/x", name: "X", nodeType: "category" },
          },
        ],
        "global",
      ),
    ).rejects.toThrow(/bulkUpdate failed|TRANSACTION_FAILED/i);

    expect(updateVersion).not.toHaveBeenCalled();
  });

  it("throws when deleteMany returns success: false (fail-closed)", async () => {
    deleteMany.mockResolvedValueOnce({
      success: false,
      message: "DELETE_MANY_NODES_FAILED",
    });

    await expect(
      contentService.upsertContentNodes([{ type: "delete", node: { path: "/gone" } }], "global"),
    ).rejects.toThrow(/deleteMany failed|DELETE_MANY/i);

    expect(updateVersion).not.toHaveBeenCalled();
  });
});
