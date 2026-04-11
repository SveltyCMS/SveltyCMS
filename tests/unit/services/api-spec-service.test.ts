/**
 * @file tests/unit/services/api-spec-service.test.ts
 * @description Whitebox tests for ApiSpecService caching and generation logic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiSpecService } from "@src/services/system/api-spec-service";

// Mock CacheService
const mockCache = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: mockCache,
}));

vi.mock("@src/databases/cache/types", () => ({
  CacheCategory: { API: "api" },
}));

describe("ApiSpecService (Whitebox)", () => {
  let service: ApiSpecService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = ApiSpecService.getInstance();
    service.__resetCache();
  });

  it("should attempt to retrieve from L2 cache first", async () => {
    mockCache.get.mockResolvedValue({ openapi: "3.1.0", fromCache: true });

    const spec = await service.generateSpec([], "tenant-1");

    expect(mockCache.get).toHaveBeenCalledWith("openapi:spec:tenant-1", "tenant-1");
    expect(spec.fromCache).toBe(true);
  });

  it("should populate L2 cache on miss", async () => {
    mockCache.get.mockResolvedValue(null);

    await service.generateSpec([{ name: "Test", fields: [] } as any], "tenant-2");

    expect(mockCache.set).toHaveBeenCalledWith(
      "openapi:spec:tenant-2",
      expect.objectContaining({ openapi: "3.1.0" }),
      300,
      "tenant-2",
      "api",
    );
  });

  it("should invalidate both L1 and L2 caches", async () => {
    await service.invalidateCache("tenant-3");

    expect(mockCache.delete).toHaveBeenCalledWith("openapi:spec:tenant-3", "tenant-3");

    // Verify L1 is also cleared by checking if generateSpec calls L2 again
    mockCache.get.mockResolvedValue({ new: true });
    const spec = await service.generateSpec([], "tenant-3");
    expect(mockCache.get).toHaveBeenCalledTimes(1);
    expect(spec.new).toBe(true);
  });
});
