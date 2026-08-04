/**
 * @file tests/unit/core/page-utils.test.ts
 * @description Unit tests for findPage helpers and count estimate eligibility.
 */

import { describe, expect, it } from "vitest";
import {
  buildFindPageResult,
  isEmptyQueryFilter,
  shouldUseEstimateCount,
} from "@src/databases/core/page-utils";

describe("isEmptyQueryFilter", () => {
  it("treats null/undefined/{} as empty", () => {
    expect(isEmptyQueryFilter(undefined)).toBe(true);
    expect(isEmptyQueryFilter(null)).toBe(true);
    expect(isEmptyQueryFilter({})).toBe(true);
  });

  it("treats keyed objects as non-empty", () => {
    expect(isEmptyQueryFilter({ status: "active" })).toBe(false);
    expect(isEmptyQueryFilter({ tenantId: "t1" })).toBe(false);
  });
});

describe("shouldUseEstimateCount", () => {
  it("allows estimate/auto on empty untenanted filters", () => {
    expect(shouldUseEstimateCount({}, { mode: "estimate" })).toBe(true);
    expect(shouldUseEstimateCount({}, { mode: "auto" })).toBe(true);
    expect(shouldUseEstimateCount(undefined, { mode: "auto" })).toBe(true);
  });

  it("never estimates when exact, filtered, or tenant-scoped", () => {
    expect(shouldUseEstimateCount({}, { mode: "exact" })).toBe(false);
    expect(shouldUseEstimateCount({ status: "x" }, { mode: "auto" })).toBe(false);
    expect(shouldUseEstimateCount({}, { mode: "auto", tenantId: "acme" })).toBe(false);
    expect(shouldUseEstimateCount({}, { mode: "estimate", includeDeleted: true })).toBe(false);
  });
});

describe("buildFindPageResult", () => {
  it("sets hasMore and trims to pageSize on limit+1 fetch", () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({
      _id: `id-${i}`,
      createdAt: "2026-01-01T00:00:00.000Z" as any,
      updatedAt: "2026-01-01T00:00:00.000Z" as any,
    }));
    const page = buildFindPageResult(rows, 50);
    expect(page.hasMore).toBe(true);
    expect(page.items).toHaveLength(50);
    expect(page.pageSize).toBe(50);
    expect(page.nextCursor).toBe("id-49");
    expect(page.total).toBeUndefined();
  });

  it("hasMore false when rows <= pageSize", () => {
    const rows = [{ _id: "a", createdAt: "" as any, updatedAt: "" as any }];
    const page = buildFindPageResult(rows, 50);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeUndefined();
  });

  it("attaches total metadata when provided", () => {
    const page = buildFindPageResult([], 50, { total: 1200, estimated: true });
    expect(page.total).toBe(1200);
    expect(page.totalEstimated).toBe(true);
  });
});
