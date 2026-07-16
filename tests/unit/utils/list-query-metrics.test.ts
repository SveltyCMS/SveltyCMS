/**
 * @file tests/unit/utils/list-query-metrics.test.ts
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearListQueryMetrics,
  recordListQuery,
  summarizeListQueryMetrics,
} from "@utils/list-query-metrics";

describe("list-query-metrics", () => {
  beforeEach(() => {
    clearListQueryMetrics();
  });

  it("records samples and computes hit rate / percentiles", () => {
    recordListQuery({
      source: "CollectionService.getCollectionData",
      durationMs: 10,
      cache: "hit",
      collectionId: "c1",
    });
    recordListQuery({
      source: "CollectionService.getCollectionData",
      durationMs: 40,
      cache: "miss",
      collectionId: "c1",
    });
    recordListQuery({
      source: "CollectionService.getCollectionData",
      durationMs: 20,
      cache: "hit",
      collectionId: "c1",
    });

    const s = summarizeListQueryMetrics("CollectionService.getCollectionData");
    expect(s.count).toBe(3);
    expect(s.hitRate).toBeCloseTo(2 / 3);
    expect(s.p50Ms).toBeGreaterThan(0);
    expect(s.avgMs).toBeGreaterThan(0);
  });
});
