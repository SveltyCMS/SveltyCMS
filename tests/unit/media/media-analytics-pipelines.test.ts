/**
 * @file tests/unit/media/media-analytics-pipelines.test.ts
 * @description Unit guard for the DB-side media analytics pipelines and assembly.
 *
 * Features:
 * - Every pipeline starts with the tenant scope and keeps it for the adapter
 * - `$group` shapes: total (`_id: null`), breakdown field, month bucket
 * - Breakdown assembly: MIME → media-type bucketing, folder `root` fallback,
 *   percentages against the database total, month map
 * - Trends: ascending order with running totals and growth
 */

import { describe, expect, it } from "vitest";
import type { DatabaseId } from "@src/databases/db-interface";
import {
  breakdownFromAggregates,
  mediaBreakdownPipeline,
  mediaMonthlyPipeline,
  mediaTotalPipeline,
  trendsFromMonthly,
  MEDIA_ANALYTICS_FOLDER_LIMIT,
  MEDIA_ANALYTICS_TREND_MONTHS,
  type MediaGroupRow,
  type MediaMonthRow,
  type MediaTotalRow,
} from "@src/utils/media/storage-analytics";

const TENANT = "tenant-analytics" as DatabaseId;

interface MatchStage {
  $match: Record<string, unknown>;
}

interface GroupStage {
  $group: { _id: unknown; files: { $sum: number }; size: { $sum: string } };
}

function matchOf(pipeline: Record<string, unknown>[]): MatchStage {
  return pipeline[0] as unknown as MatchStage;
}

function groupOf(pipeline: Record<string, unknown>[]): GroupStage["$group"] {
  return (pipeline[1] as unknown as GroupStage).$group;
}

describe("media analytics pipelines", () => {
  it("scopes every pipeline to the tenant", () => {
    const pipelines = [
      mediaTotalPipeline(TENANT),
      mediaBreakdownPipeline(TENANT, "mimeType"),
      mediaBreakdownPipeline(TENANT, "folderId", MEDIA_ANALYTICS_FOLDER_LIMIT),
      mediaMonthlyPipeline(TENANT),
    ];

    for (const pipeline of pipelines) {
      expect(matchOf(pipeline)).toEqual({ $match: { tenantId: TENANT } });
    }
  });

  it("computes files and size in one total group", () => {
    const pipeline = mediaTotalPipeline(TENANT);

    expect(groupOf(pipeline)).toEqual({
      _id: null,
      files: { $sum: 1 },
      size: { $sum: "$size" },
    });
    expect(pipeline).toHaveLength(2);
  });

  it("groups a breakdown field, sorts by size and applies the supplied limit", () => {
    const limited = mediaBreakdownPipeline(TENANT, "folderId", 25);

    expect(groupOf(limited)).toEqual({
      _id: "$folderId",
      files: { $sum: 1 },
      size: { $sum: "$size" },
    });
    expect(limited[2]).toEqual({ $sort: { size: -1 } });
    expect(limited[3]).toEqual({ $limit: 25 });

    // Types are grouped by MIME and bucketed later, so they must not be truncated
    // in the database (the top five are media types, not MIME types).
    expect(mediaBreakdownPipeline(TENANT, "mimeType")).toHaveLength(3);
  });

  it("builds a month bucket, newest first and capped at the trend window", () => {
    const pipeline = mediaMonthlyPipeline(TENANT);

    expect(groupOf(pipeline)._id).toEqual({
      $dateToString: { format: "%Y-%m", date: { $toDate: "$createdAt" } },
    });
    expect(pipeline[2]).toEqual({ $sort: { _id: -1 } });
    expect(pipeline[3]).toEqual({ $limit: MEDIA_ANALYTICS_TREND_MONTHS });
  });
});

describe("breakdownFromAggregates", () => {
  it("buckets MIME rows into media types and percentages of the total", () => {
    const breakdown = breakdownFromAggregates({
      total: { _id: null, files: 4, size: 4000 },
      typeRows: [
        { _id: "image/png", files: 2, size: 2000 },
        { _id: "image/jpeg", files: 1, size: 500 },
        { _id: "video/mp4", files: 1, size: 1500 },
      ],
      folderRows: [
        { _id: null, files: 1, size: 1000 },
        { _id: "folder-a", files: 3, size: 3000 },
      ],
      userRows: [
        { _id: "user-a", files: 3, size: 3500 },
        { _id: null, files: 1, size: 500 },
      ],
      monthRows: [
        { _id: "2026-10", files: 1, size: 1000 },
        { _id: "2026-11", files: 3, size: 3000 },
      ],
    });

    expect(breakdown.byType.image).toEqual({ count: 3, size: 2500, pct: 62.5 });
    expect(breakdown.byType.video).toEqual({ count: 1, size: 1500, pct: 37.5 });
    expect(breakdown.byFolder.root).toEqual({ count: 1, size: 1000, pct: 25 });
    // A null creator is skipped instead of becoming a synthetic user bucket.
    expect(Object.keys(breakdown.byUser)).toEqual(["user-a"]);
    expect(breakdown.byMonth).toEqual({
      "2026-10": { count: 1, size: 1000 },
      "2026-11": { count: 3, size: 3000 },
    });
    expect(breakdown.total).toEqual({ files: 4, size: 4000, avgSize: 1000 });
  });

  it("derives the total from the type rollup when the total query failed", () => {
    const breakdown = breakdownFromAggregates({
      typeRows: [
        { _id: "image/png", files: 2, size: 1200 },
        { _id: "audio/mpeg", files: 1, size: 300 },
      ],
    });

    expect(breakdown.total).toEqual({ files: 3, size: 1500, avgSize: 500 });
    expect(breakdown.byType.image.pct).toBe(80);
    expect(breakdown.byType.audio.pct).toBe(20);
  });

  it("normalises SQL driver counters and drops undated month buckets", () => {
    // postgres.js (int8) and mysql2 (DECIMAL) may return SUM(...) as a string.
    const breakdown = breakdownFromAggregates({
      total: { _id: null, files: "2", size: "3000" } as unknown as MediaTotalRow,
      typeRows: [{ _id: "image/png", files: "2", size: "3000" } as unknown as MediaGroupRow],
      monthRows: [
        { _id: "2026-11", files: "2", size: "3000" } as unknown as MediaMonthRow,
        { _id: null, files: "1", size: "0" } as unknown as MediaMonthRow,
      ],
    });

    expect(breakdown.total).toEqual({ files: 2, size: 3000, avgSize: 1500 });
    expect(breakdown.byMonth).toEqual({ "2026-11": { count: 2, size: 3000 } });
  });

  it("returns empty maps (never NaN) for a tenant with no media", () => {
    const breakdown = breakdownFromAggregates({});

    expect(breakdown.total).toEqual({ files: 0, size: 0, avgSize: 0 });
    expect(breakdown.byType).toEqual({});
    expect(breakdown.byFolder).toEqual({});
    expect(breakdown.byUser).toEqual({});
    expect(breakdown.byMonth).toEqual({});
  });
});

describe("trendsFromMonthly", () => {
  it("orders ascending, keeps a running total and computes growth", () => {
    const trends = trendsFromMonthly([
      { _id: "2026-11", files: 3, size: 3000 },
      { _id: "2026-10", files: 1, size: 1000 },
    ]);

    expect(trends).toEqual([
      { month: "2026-10", uploads: 1, addedSize: 1000, totalSize: 1000, growthPct: 0 },
      { month: "2026-11", uploads: 3, addedSize: 3000, totalSize: 4000, growthPct: 200 },
    ]);
  });

  it("normalises string counters from SQL drivers", () => {
    const trends = trendsFromMonthly([
      { _id: "2026-10", files: "1", size: "1000" },
      { _id: "2026-11", files: "3", size: "3000" },
    ] as unknown as MediaMonthRow[]);

    expect(trends).toEqual([
      { month: "2026-10", uploads: 1, addedSize: 1000, totalSize: 1000, growthPct: 0 },
      { month: "2026-11", uploads: 3, addedSize: 3000, totalSize: 4000, growthPct: 200 },
    ]);
  });

  it("returns an empty series when the month query failed", () => {
    expect(trendsFromMonthly([])).toEqual([]);
  });
});
