/**
 * @file tests/unit/api/media-analytics.test.ts
 * @description Contract tests for the media analytics handler with a mocked DB adapter.
 *
 * Features:
 * - Every aggregation pipeline carries the tenant scope (pipeline and options)
 * - The response preserves `{ total, byType, insights, trends, quota }`
 * - All breakdowns are produced by `crud.aggregate` (no asset-list sampling)
 * - A refused/failed aggregate degrades to a 200 with empty analytics
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/databases/db-interface";

vi.mock("@utils/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { handleMediaAnalytics } from "@src/routes/api/[...path]/handlers/media";

const TENANT = "tenant-analytics" as DatabaseId;

interface AggregateRow {
  _id: unknown;
  files: number;
  size: number;
}

interface GroupStage {
  $group: { _id: unknown };
}

interface AnalyticsBody {
  byType: Array<{ type: string; count: number; size: number; pct: number }>;
  insights: Array<{ title: string }>;
  quota: { available: number; percentage: number; status: string; used: number };
  total: { avgSize: number; files: number; formattedSize: string; size: number };
  trends: Array<{
    addedSize: number;
    growthPct: number;
    month: string;
    totalSize: number;
    uploads: number;
  }>;
}

const aggregate = vi.fn();
const findMany = vi.fn();

const cms = {
  db: { crud: { aggregate, findMany } },
} as unknown as LocalCMS;

function createEvent(): RequestEvent {
  const url = "http://localhost/api/media/analytics";
  return {
    locals: {},
    request: new Request(url),
    url: new URL(url),
  } as unknown as RequestEvent;
}

function groupIdOf(pipeline: Record<string, unknown>[]): unknown {
  return (pipeline[1] as unknown as GroupStage).$group._id;
}

/** Answers each analytics pipeline by its group key. */
function stubAggregates(): void {
  aggregate.mockImplementation(async (_collection: string, pipeline: Record<string, unknown>[]) => {
    const id = groupIdOf(pipeline);
    if (id === null) {
      return { success: true, data: [{ _id: null, files: 4, size: 4000 }] };
    }
    if (id === "$mimeType") {
      return {
        success: true,
        data: [
          { _id: "image/png", files: 2, size: 2000 },
          { _id: "image/jpeg", files: 1, size: 500 },
          { _id: "video/mp4", files: 1, size: 1500 },
        ] satisfies AggregateRow[],
      };
    }
    if (id === "$folderId") {
      return {
        success: true,
        data: [
          { _id: null, files: 1, size: 1000 },
          { _id: "folder-a", files: 3, size: 3000 },
        ] satisfies AggregateRow[],
      };
    }
    if (id === "$createdBy") {
      return {
        success: true,
        data: [{ _id: "user-a", files: 4, size: 4000 }] satisfies AggregateRow[],
      };
    }
    return {
      success: true,
      data: [
        { _id: "2026-10", files: 1, size: 1000 },
        { _id: "2026-11", files: 3, size: 3000 },
      ] satisfies AggregateRow[],
    };
  });
  findMany.mockResolvedValue({ success: true, data: [] });
}

beforeEach(() => {
  aggregate.mockReset();
  findMany.mockReset();
});

describe("handleMediaAnalytics", () => {
  it("scopes every aggregation to the tenant and keeps the response contract", async () => {
    stubAggregates();

    const response = await handleMediaAnalytics(createEvent(), cms, TENANT);
    expect(response.status).toBe(200);

    const body = (await response.json()) as { success: boolean; data: AnalyticsBody };
    expect(body.success).toBe(true);
    expect(Object.keys(body.data).sort()).toEqual([
      "byType",
      "insights",
      "quota",
      "total",
      "trends",
    ]);

    // Five rollups: total + mimeType + folderId + createdBy + month. Insight
    // samples use findMany, never aggregate.
    expect(aggregate).toHaveBeenCalledTimes(5);
    for (const call of aggregate.mock.calls) {
      const [collection, pipeline, options] = call as [
        string,
        Record<string, unknown>[],
        { tenantId: DatabaseId },
      ];
      expect(collection).toBe("media");
      expect(pipeline[0]).toEqual({ $match: { tenantId: TENANT } });
      expect(options).toEqual({ tenantId: TENANT });
    }

    expect(body.data.total).toEqual({
      files: 4,
      size: 4000,
      avgSize: 1000,
      formattedSize: "3.91 KB",
    });
    expect(body.data.byType).toEqual([
      { type: "image", count: 3, size: 2500, pct: 62.5 },
      { type: "video", count: 1, size: 1500, pct: 37.5 },
    ]);
    expect(body.data.trends).toEqual([
      { month: "2026-10", uploads: 1, addedSize: 1000, totalSize: 1000, growthPct: 0 },
      { month: "2026-11", uploads: 3, addedSize: 3000, totalSize: 4000, growthPct: 200 },
    ]);
    expect(body.data.quota.used).toBe(4000);
    expect(body.data.insights).toEqual([]);
  });

  it("feeds insights from bounded, condition-targeted samples", async () => {
    stubAggregates();
    findMany.mockImplementation(async (_collection: string, query: Record<string, unknown>) => {
      if ("size" in query) {
        return {
          success: true,
          data: [{ _id: "large-1", size: 20 * 1024 * 1024 }],
        };
      }
      return {
        success: true,
        data: [
          { _id: "old-1", size: 100, createdAt: "2000-01-01T00:00:00.000Z" },
          // Duplicate: also a large file, must not be counted twice.
          { _id: "large-1", size: 20 * 1024 * 1024, createdAt: "2000-01-01T00:00:00.000Z" },
        ],
      };
    });

    const response = await handleMediaAnalytics(createEvent(), cms, TENANT);
    const body = (await response.json()) as { success: boolean; data: AnalyticsBody };

    expect(findMany).toHaveBeenCalledTimes(2);
    for (const call of findMany.mock.calls) {
      const [, , options] = call as [string, unknown, { limit: number; tenantId: DatabaseId }];
      expect(options.tenantId).toBe(TENANT);
      expect(options.limit).toBe(500);
    }

    expect(body.data.insights.map((insight) => insight.title)).toEqual([
      "Large Files",
      "Old Files",
    ]);
  });

  it("degrades to empty analytics instead of a 500 when aggregation is refused", async () => {
    aggregate.mockResolvedValue({
      success: false,
      message: "Aggregation stage $dateToString is not supported",
      error: { code: "NOT_SUPPORTED", message: "not supported" },
    });
    findMany.mockRejectedValue(new Error("driver unavailable"));

    const response = await handleMediaAnalytics(createEvent(), cms, TENANT);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean; data: AnalyticsBody };
    expect(body.success).toBe(true);
    expect(body.data.total).toEqual({
      files: 0,
      size: 0,
      avgSize: 0,
      formattedSize: "0 Bytes",
    });
    expect(body.data.byType).toEqual([]);
    expect(body.data.trends).toEqual([]);
    expect(body.data.insights).toEqual([]);
    expect(body.data.quota).toEqual({
      used: 0,
      available: 10 * 1024 * 1024 * 1024,
      percentage: 0,
      status: "healthy",
    });
  });

  it("derives the total from the type rollup when only the total query fails", async () => {
    aggregate.mockImplementation(
      async (_collection: string, pipeline: Record<string, unknown>[]) => {
        const id = groupIdOf(pipeline);
        if (id === null) {
          return { success: false, message: "total unavailable", error: { code: "ERROR" } };
        }
        if (id === "$mimeType") {
          return {
            success: true,
            data: [
              { _id: "image/png", files: 2, size: 1200 },
              { _id: "audio/mpeg", files: 1, size: 300 },
            ] satisfies AggregateRow[],
          };
        }
        return { success: true, data: [] };
      },
    );
    findMany.mockResolvedValue({ success: true, data: [] });

    const response = await handleMediaAnalytics(createEvent(), cms, TENANT);
    const body = (await response.json()) as { success: boolean; data: AnalyticsBody };

    expect(body.data.total).toEqual({
      files: 3,
      size: 1500,
      avgSize: 500,
      formattedSize: "1.46 KB",
    });
    expect(body.data.byType.map((entry) => entry.type)).toEqual(["image", "audio"]);
  });
});
