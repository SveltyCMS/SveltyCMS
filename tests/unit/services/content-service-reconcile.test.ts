import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("node:fs/promises", () => ({
  default: {
    stat: vi.fn(),
    readdir: vi.fn(),
  },
}));

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
    CONTENT_UPDATE: "CONTENT_UPDATE",
  },
}));

vi.mock("../../../src/content/module-processor.server", () => ({
  loadSchemaNative: vi.fn(),
  generateSchemaHash: vi.fn(() => "abc-hash"),
}));

describe("ContentService - Incremental Reconciliation", () => {
  let contentService: any;

  beforeEach(async () => {
  	vi.clearAllMocks();
  	const module = await import("../../../src/content/content-service.server");
  	contentService = module.contentService;
  });

  it("should perform a surgical update when a single file changes", async () => {
  const { loadSchemaNative } = await import("../../../src/content/module-processor.server");

    const { contentStore } = await import("../../../src/stores/content-store.svelte");
    const { eventBus } = await import("../../../src/utils/event-bus");
    const fs = (await import("node:fs/promises")).default;

    const mockSchema = {
      _id: "test-col",
      name: "Test Collection",
      path: "posts/test.js",
    };

    // Setup mocks
    (fs.stat as any).mockResolvedValue({ mtimeMs: 12345 });
    (loadSchemaNative as any).mockResolvedValue({ schema: mockSchema });

    const mockAdapter = {
      content: {
        nodes: {
          getStructure: vi.fn().mockResolvedValue({ success: true, data: [] }),
          bulkUpdate: vi.fn().mockResolvedValue({ success: true }),
        },
      },
    };

    await contentService.handleIncrementalReload(
      "posts/test.js",
      "test-tenant",
      mockAdapter as any,
      ".compiledCollections",
    );

    // 1. Verify schema was loaded
    expect(loadSchemaNative).toHaveBeenCalledWith(expect.stringContaining("test.js"));

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
    expect(eventBus.broadcast).toHaveBeenCalledWith("CONTENT_UPDATE", expect.any(Object));
  });

  it("should skip processing if file hash matches cache (HMR optimization)", async () => {
    const { cacheService } = await import("../../../src/databases/cache/cache-service");
    const { loadSchemaNative } = await import("../../../src/content/module-processor.server");
    const fs = (await import("node:fs/promises")).default;

    (fs.stat as any).mockResolvedValue({ mtimeMs: 12345 });
    (cacheService.get as any).mockResolvedValue({ hash: "abc-hash", mtime: 12000 });
    (loadSchemaNative as any).mockResolvedValue({ schema: { name: "Same" } });

    const mockAdapter = { content: { nodes: { getStructure: vi.fn() } } };

    await contentService.handleIncrementalReload(
      "posts/test.js",
      "test-tenant",
      mockAdapter as any,
      ".compiledCollections",
    );

    // Database should NOT be queried if hash matches
    expect(mockAdapter.content.nodes.getStructure).not.toHaveBeenCalled();
  });
});
