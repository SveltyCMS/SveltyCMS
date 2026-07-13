/**
 * @file tests/unit/services/content-structure-namespace.test.ts
 * @description Unit tests for LocalCMS ContentStructureNamespace.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseId } from "@src/databases/db-interface";

const TENANT: DatabaseId = "global" as DatabaseId;

vi.mock("@src/content/index.server", () => ({
  syncContentState: vi.fn().mockResolvedValue({
    reason: "gui-save",
    contentStructure: [{ _id: "cat-1", path: "/blog", name: "Blog", nodeType: "category" }],
  }),
}));

vi.mock("@src/content/engine.server", () => ({
  contentService: {
    getContentStructureFromDatabase: vi
      .fn()
      .mockResolvedValue([{ _id: "cat-1", path: "/blog", name: "Blog", nodeType: "category" }]),
  },
}));

describe("ContentStructureNamespace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saveGuiStructure calls syncContentState with gui-save reason", async () => {
    const { ContentStructureNamespace } =
      await import("@src/services/sdk/namespaces/data-operations");
    const { syncContentState } = await import("@src/content/index.server");

    const ns = new ContentStructureNamespace({} as never);
    await ns.saveGuiStructure(
      [{ type: "create", node: { path: "/blog", name: "Blog", nodeType: "category" } }],
      { tenantId: TENANT },
    );

    expect(syncContentState).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "gui-save", tenantId: TENANT }),
    );
  });

  it("deleteByIds builds delete operations from node ids", async () => {
    const { ContentStructureNamespace } =
      await import("@src/services/sdk/namespaces/data-operations");
    const { syncContentState } = await import("@src/content/index.server");

    const ns = new ContentStructureNamespace({} as never);
    const result = await ns.deleteByIds(["cat-1"], { tenantId: TENANT });

    expect(result.found).toBe(true);
    expect(syncContentState).toHaveBeenCalledWith(
      expect.objectContaining({
        operations: [{ type: "delete", node: { path: "/blog" } }],
      }),
    );
  });
});
