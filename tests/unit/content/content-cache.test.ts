import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/databases/cache/cache-service", () => ({
  cacheService: {
    set: vi.fn(),
    clearByPattern: vi.fn(),
  },
}));

vi.mock("../../../src/utils/event-bus", () => ({
  eventBus: { broadcast: vi.fn() },
  SystemEvents: { CONTENT_UPDATE: "content:update" },
}));

describe("engine.server cache helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("schemaCacheTags returns schema and collection id tags", async () => {
    const { schemaCacheTags } = await import("../../../src/content/engine.server");
    expect(schemaCacheTags({ _id: "Posts", name: "Posts", fields: [] })).toEqual([
      "schema",
      "schema:posts",
    ]);
  });

  it("invalidateSchemaCache uses schema: prefix pattern", async () => {
    const { invalidateSchemaCache } = await import("../../../src/content/engine.server");
    const { cacheService } = await import("../../../src/databases/cache/cache-service");

    await invalidateSchemaCache(null);
    expect(cacheService.clearByPattern).toHaveBeenCalledWith("schema:", null);
  });

  it("notifyContentUpdate clears navigation and broadcasts", async () => {
    const { notifyContentUpdate } = await import("../../../src/content/engine.server");
    const { cacheService } = await import("../../../src/databases/cache/cache-service");
    const { eventBus } = await import("../../../src/utils/event-bus");

    await notifyContentUpdate("tenant-a");

    expect(cacheService.clearByPattern).toHaveBeenCalledWith("navigation:tree:", "tenant-a");
    expect(eventBus.broadcast).toHaveBeenCalledWith(
      "content:update",
      expect.objectContaining({ tenantId: "tenant-a" }),
    );
  });

  it("notifyContentUpdate can clear schema prefix on full reload", async () => {
    const { notifyContentUpdate } = await import("../../../src/content/engine.server");
    const { cacheService } = await import("../../../src/databases/cache/cache-service");

    await notifyContentUpdate(null, { invalidateSchema: true });

    expect(cacheService.clearByPattern).toHaveBeenCalledWith("schema:", null);
    expect(cacheService.clearByPattern).toHaveBeenCalledWith("navigation:tree:", null);
  });
});
