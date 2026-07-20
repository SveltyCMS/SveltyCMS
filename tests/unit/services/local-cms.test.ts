/**
 * @file tests/unit/services/local-cms.test.ts
 * @description Tests for LocalCMS — the zero-latency internal SDK bridge.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { LocalCMS } from "@src/services/sdk";

describe("LocalCMS - Server-Side SDK Bridge", () => {
  let mockAdapter: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = {
      crud: {
        findMany: vi.fn().mockResolvedValue({ success: true, data: [{ title: "SDK Test" }] }),
        findOne: vi.fn(),
      },
      auth: { user: {}, session: {}, token: {} },
      media: {},
      settings: {},
      collection: {
        getModel: vi.fn().mockResolvedValue({}),
      },
      system: { preferences: {} },
      content: { nodes: {} },
      isConnected: vi.fn(() => true),
    };
  });

  it("should bypass HTTP overhead and call adapter directly with collection prefix", async () => {
    const contentMock = {
      getCollectionById: vi.fn((id) => ({
        _id: id,
        name: "Test",
        fields: [],
      })),
      getCollections: vi.fn(() => [{ _id: "posts", fields: [] }]),
    };

    const sdk = new LocalCMS(mockAdapter, contentMock);
    const result = await sdk.collections.find("posts", {
      tenantId: "tenant-1",
      bypassCache: true,
    });

    // SDK prepends 'collection_' to the ID.
    // tenantId is merged into the query (2nd arg), not the options (3rd arg).
    expect(mockAdapter.crud.findMany).toHaveBeenCalledWith(
      "collection_posts",
      expect.objectContaining({ tenantId: "tenant-1" }),
      expect.objectContaining({ limit: 50, offset: 0 }),
    );
    expect(result.data[0].title).toBe("SDK Test");
  });

  it("should provide an ergonomic locals.cms bridge via DI-enabled getLocals", async () => {
    const contentMock = {
      getCollectionById: vi.fn((id) => ({
        _id: id,
        name: "Test",
        fields: [],
      })),
      getCollections: vi.fn(() => [{ _id: "pages", fields: [] }]),
    };

    const eventLocals = {
      tenantId: "tenant-ABC",
      user: { id: "user-1" },
      isAdmin: true,
    };

    const locals = LocalCMS.getLocals(mockAdapter, eventLocals, contentMock);
    await locals.find("pages", { bypassCache: true });

    // tenantId is merged into the query (2nd arg), not the options (3rd arg).
    expect(mockAdapter.crud.findMany).toHaveBeenCalledWith(
      "collection_pages",
      expect.objectContaining({ tenantId: "tenant-ABC" }),
      expect.objectContaining({ limit: 50, offset: 0 }),
    );
  });
});
