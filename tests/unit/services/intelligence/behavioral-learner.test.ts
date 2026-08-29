/**
 * @file tests/unit/services/intelligence/behavioral-learner.test.ts
 * @description Unit tests for Behavioral Learner and Cache Warming integration.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  recordCollectionAccess,
  recordWriteAccess,
  recordNavigation,
  getHotCollections,
  getHotEntries,
  predictNextPath,
  predictNextPathAdaptive,
  reinforceTransition,
  penalizeTransition,
  clearBehavioralData,
} from "@src/services/intelligence/behavioral-learner";
import { CacheWarmingService } from "@src/databases/cache/cache-warming-service";
import { cacheService } from "@src/databases/cache/cache-service";

describe("Behavioral Learner Engine", () => {
  beforeEach(() => {
    clearBehavioralData();
  });

  describe("recordWriteAccess", () => {
    it("records collection and entry write operations with higher weight", () => {
      recordWriteAccess("tenant-a", "posts", "post-123");

      const hotCols = getHotCollections("tenant-a");
      expect(hotCols).toHaveLength(1);
      expect(hotCols[0].id).toBe("posts");
      expect(hotCols[0].score).toBeCloseTo(2, 3);

      const hotEntries = getHotEntries("tenant-a");
      expect(hotEntries).toHaveLength(1);
      expect(hotEntries[0].collectionId).toBe("posts");
      expect(hotEntries[0].entryId).toBe("post-123");
      expect(hotEntries[0].score).toBeCloseTo(2, 3);
    });

    it("handles collection-only writes without entry id", () => {
      recordWriteAccess("tenant-b", "categories");

      const hotCols = getHotCollections("tenant-b");
      expect(hotCols).toHaveLength(1);
      expect(hotCols[0].id).toBe("categories");
      expect(hotCols[0].score).toBeCloseTo(2, 1);

      const hotEntries = getHotEntries("tenant-b");
      expect(hotEntries).toHaveLength(0);
    });

    it("differentiates weights: write carries 2x weight of read", () => {
      recordCollectionAccess("tenant-c", "articles");
      recordWriteAccess("tenant-c", "products");

      const hotCols = getHotCollections("tenant-c");
      expect(hotCols[0].id).toBe("products");
      expect(hotCols[0].score).toBeCloseTo(2, 1);
      expect(hotCols[1].id).toBe("articles");
      expect(hotCols[1].score).toBeCloseTo(1, 1);
    });
  });

  describe("Operant Conditioning & Predictions", () => {
    it("reinforces followed predictions and penalizes bounces", () => {
      recordNavigation("tenant-d", "/admin/posts", "/admin/posts/edit");
      reinforceTransition("tenant-d", "/admin/posts", "/admin/posts/edit");

      const next = predictNextPath("tenant-d", "/admin/posts");
      expect(next).toBe("/admin/posts/edit");

      penalizeTransition("tenant-d", "/admin/posts", "/admin/posts/edit");
    });

    it("returns null from predictNextPathAdaptive until confidence threshold is reached", () => {
      // With zero previous hits, confidence is low -> returns null (no false-positive preload headers)
      const uncalibrated = predictNextPathAdaptive("tenant-e", "/admin/products");
      expect(uncalibrated).toBeNull();
    });
  });
});

describe("CacheWarmingService (Behavioral Pre-Warming)", () => {
  it("pre-warms canonical SDK cache keys for hot collections and entries", async () => {
    clearBehavioralData();
    recordWriteAccess("tenant-test", "articles", "art-1");

    const setSpy = vi.spyOn(cacheService, "set").mockResolvedValue(undefined as any);

    const mockDb = {
      crud: {
        find: vi.fn().mockResolvedValue({
          success: true,
          data: [{ _id: "art-1", title: "Test Article" }],
        }),
        findOne: vi.fn().mockResolvedValue({
          success: true,
          data: { _id: "art-1", title: "Test Article" },
        }),
      },
    };

    const warmingService = new CacheWarmingService();
    const result = await warmingService.warmFromBehavioralLearning("tenant-test", mockDb);

    expect(result).toBe(true);
    expect(mockDb.crud.find).toHaveBeenCalledWith(
      "articles",
      {},
      expect.objectContaining({ limit: 50 }),
    );
    expect(mockDb.crud.findOne).toHaveBeenCalledWith(
      "articles",
      { _id: "art-1" },
      expect.anything(),
    );

    // Verify exact SDK keyspace matching
    expect(setSpy).toHaveBeenCalledWith(
      "tenant-test:collection:articles:find:default_50:published",
      expect.objectContaining({ success: true }),
      300,
      "tenant-test",
    );
    expect(setSpy).toHaveBeenCalledWith(
      "tenant-test:collection:articles:art-1:published",
      expect.objectContaining({ success: true }),
      300,
      "tenant-test",
    );
    expect(setSpy).toHaveBeenCalledWith(
      "tenant-test:collection:articles:find:id:art-1",
      expect.objectContaining({ success: true, data: expect.any(Array) }),
      300,
      "tenant-test",
    );

    setSpy.mockRestore();
  });
});
