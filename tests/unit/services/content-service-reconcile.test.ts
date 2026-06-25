import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("node:fs/promises", () => {
  const mockFs = {
    stat: vi.fn(),
    readdir: vi.fn(),
    mkdir: vi.fn(),
  };
  return {
    ...mockFs,
    default: mockFs,
  };
});

vi.mock("../../../src/utils/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../../src/databases/cache/cache-service", () => ({
  cacheService: {
    get: vi.fn(),
    set: vi.fn(),
    clearByPattern: vi.fn(),
  },
}));

vi.mock("../../../src/stores/content-store.svelte", () => ({
  contentStore: {
    upsert: vi.fn(),
    sync: vi.fn(),
    clear: vi.fn(),
  },
}));

vi.mock("../../../src/utils/event-bus", () => ({
  eventBus: {
    broadcast: vi.fn(),
  },
  SystemEvents: {
    CONTENT_UPDATE: "content:update",
  },
}));

vi.mock("../../../src/content/loader.server", () => ({
  loadSchema: vi.fn(),
  loadSchemaNative: vi.fn(),
  generateSchemaHash: vi.fn(() => "abc-hash"),
  isSafeCollectionPath: vi.fn(() => true),
}));

describe("ContentService - Incremental Reconciliation", () => {
  let contentService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("../../../src/content/engine.server");
    contentService = module.contentService;
  });

  it("should perform a surgical update when a single file changes", async () => {
    const { loadSchema } = await import("../../../src/content/loader.server");

    const { contentStore } = await import("../../../src/stores/content-store.svelte");
    const { eventBus } = await import("../../../src/utils/event-bus");
    const fs = (await import("node:fs/promises")).default;

    const mockSchema = {
      _id: "test-col",
      name: "Test Collection",
      path: "/collection/posts/test",
      fields: [
        {
          db_fieldName: "title",
          label: "Title",
          required: true,
          translated: false,
        },
      ],
    };

    // Setup mocks
    (fs.stat as any).mockResolvedValue({ mtimeMs: 12345 });
    (loadSchema as any).mockResolvedValue({ schema: mockSchema });

    const mockAdapter = {
      content: {
        nodes: {
          getStructure: vi.fn().mockResolvedValue({ success: true, data: [] }),
          bulkUpdate: vi.fn().mockResolvedValue({ success: true }),
        },
      },
    };

    await contentService.handleIncrementalReload(
      ".compiledCollections/posts/test.js",
      "test-tenant",
      mockAdapter as any,
    );

    // 1. Verify schema was loaded
    expect(loadSchema).toHaveBeenCalledWith(expect.stringContaining("test.js"), expect.any(Number));

    // 2. Verify database was updated
    expect(mockAdapter.content.nodes.bulkUpdate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "test-col",
          changes: expect.objectContaining({ name: "Test Collection" }),
        }),
      ]),
      expect.objectContaining({ tenantId: "test-tenant" }),
    );

    // 3. Verify in-memory store was updated surgically
    expect(contentStore.upsert).toHaveBeenCalledWith(expect.objectContaining({ _id: "test-col" }));

    // 4. Verify event was broadcast
    expect(eventBus.broadcast).toHaveBeenCalledWith("content:update", expect.any(Object));
  });

  it("should skip processing if file hash matches cache (HMR optimization)", async () => {
    const { cacheService } = await import("../../../src/databases/cache/cache-service");
    const { loadSchema } = await import("../../../src/content/loader.server");
    const fs = (await import("node:fs/promises")).default;

    (fs.stat as any).mockResolvedValue({ mtimeMs: 12345 });
    (cacheService.get as any).mockResolvedValue({
      hash: "abc-hash",
      mtime: 12000,
    });
    (loadSchema as any).mockResolvedValue({
      schema: {
        name: "Same",
        fields: [
          {
            db_fieldName: "title",
            label: "Title",
            required: true,
            translated: false,
          },
        ],
      },
    });

    const mockAdapter = { content: { nodes: { getStructure: vi.fn() } } };

    await contentService.handleIncrementalReload(
      ".compiledCollections/posts/test.js",
      "test-tenant",
      mockAdapter as any,
    );

    // Database should NOT be queried if hash matches
    expect(mockAdapter.content.nodes.getStructure).not.toHaveBeenCalled();
  });
});
