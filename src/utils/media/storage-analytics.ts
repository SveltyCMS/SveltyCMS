/**
 * @file src/utils/media/storage-analytics.ts
 * @description Storage analytics & insights for media files
 *
 * Features:
 * - Breakdown by type/folder/user/month
 * - Actionable insights
 * - Growth trends
 * - Top consumers
 * - Quota monitoring
 * - Simple prediction
 */

import path from "node:path";
import type { DatabaseId } from "@src/databases/db-interface";
import { formatBytes } from "@utils/utils";
import type { MediaItem } from "./media-models";
import { isStoredMedia } from "./media-models";

/** Typed breakdown entry (replaces `Record<string, any>`). */
export interface SizeCount {
  count: number;
  size: number;
}

export interface PctSizeCount extends SizeCount {
  pct: number;
}

/** Storage breakdown */
export interface Breakdown {
  byFolder: Record<string, PctSizeCount>;
  byMonth: Record<string, SizeCount>; // YYYY-MM
  byType: Record<string, PctSizeCount>;
  byUser: Record<DatabaseId, PctSizeCount>;
  total: {
    files: number;
    size: number;
    avgSize: number;
  };
}

/** Insight card */
export interface Insight {
  action?: { label: string; data: unknown };
  actionable?: boolean;
  desc: string;
  title: string;
  type: "success" | "info" | "warning";
}

/** Monthly trend */
export interface Trend {
  addedSize: number;
  growthPct: number;
  month: string;
  totalSize: number;
  uploads: number;
}

/** Analyze current storage */
export function analyze(files: MediaItem[]): Breakdown {
  const byType: Record<string, SizeCount> = {};
  const byFolder: Record<string, SizeCount> = {};
  const byUser: Record<DatabaseId, SizeCount> = {};
  const byMonth: Record<string, SizeCount> = {};

  let totalSize = 0;
  let totalFiles = 0;

  for (const f of files) {
    // Use type guard for size — remote videos have no `size` field
    const size = isStoredMedia(f) ? (f.size ?? 0) : 0;
    totalSize += size;
    totalFiles++;

    // Type
    const type = f.type ?? "unknown";
    byType[type] ??= { count: 0, size: 0 };
    byType[type].count++;
    byType[type].size += size;

    // Folder — only stored media has a `path`
    const folder = isStoredMedia(f) && f.path ? path.dirname(f.path) : "root";
    byFolder[folder] ??= { count: 0, size: 0 };
    byFolder[folder].count++;
    byFolder[folder].size += size;

    // User
    if (f.user) {
      byUser[f.user] ??= { count: 0, size: 0 };
      byUser[f.user].count++;
      byUser[f.user].size += size;
    }

    // Month
    if (f.createdAt) {
      const month = f.createdAt.slice(0, 7);
      byMonth[month] ??= { count: 0, size: 0 };
      byMonth[month].count++;
      byMonth[month].size += size;
    }
  }

  // Percentages
  const addPct = <T extends SizeCount>(
    obj: Record<string, T>,
  ): Record<string, T & { pct: number }> => {
    const result: Record<string, T & { pct: number }> = {};
    if (totalSize <= 0) return result;
    for (const k in obj) {
      result[k] = { ...obj[k], pct: (obj[k].size / totalSize) * 100 };
    }
    return result;
  };

  return {
    byType: addPct(byType),
    byFolder: addPct(byFolder),
    byUser: addPct(byUser),
    byMonth,
    total: {
      files: totalFiles,
      size: totalSize,
      avgSize: totalFiles ? totalSize / totalFiles : 0,
    },
  };
}

/** Generate insights from storage breakdown */
export function generateInsights(files: MediaItem[], breakdown: Breakdown): Insight[] {
  const list: Insight[] = [];

  // Large files (>10MB)
  const large = files.filter((f) => isStoredMedia(f) && (f.size ?? 0) > 10 * 1024 * 1024);
  if (large.length) {
    const size = large.reduce((s, f) => s + (isStoredMedia(f) ? f.size : 0), 0);
    list.push({
      type: "info",
      title: "Large Files",
      desc: `${large.length} files >10MB (${formatBytes(size)})`,
      actionable: true,
      action: { label: "View", data: large.map((f) => f._id) },
    });
  }

  // Old files (>1 year)
  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const old = files.filter((f) => f.createdAt && new Date(f.createdAt) < yearAgo);
  if (old.length) {
    const size = old.reduce((s, f) => s + (isStoredMedia(f) ? f.size : 0), 0);
    list.push({
      type: "info",
      title: "Old Files",
      desc: `${old.length} files >1 year old (${formatBytes(size)})`,
      actionable: true,
      action: { label: "View", data: old.map((f) => f._id) },
    });
  }

  // Dominant type
  const topType = Object.entries(breakdown.byType).sort((a, b) => b[1].size - a[1].size)[0];
  if (topType && topType[1].pct > 70) {
    list.push({
      type: "info",
      title: "Dominant File Type",
      desc: `${topType[0]} files use ${topType[1].pct.toFixed(1)}% of storage`,
    });
  }

  return list;
}

/** Monthly trends */
export function trends(files: MediaItem[]): Trend[] {
  const monthly: Record<string, { count: number; size: number }> = {};

  for (const f of files) {
    if (!f.createdAt) {
      continue;
    }
    const m = f.createdAt.slice(0, 7);
    monthly[m] ??= { count: 0, size: 0 };
    monthly[m].count++;
    monthly[m].size += isStoredMedia(f) ? (f.size ?? 0) : 0;
  }

  const sorted = Object.keys(monthly).sort();
  const result: Trend[] = [];
  let total = 0;

  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];
    const stats = monthly[m];
    total += stats.size;

    const prev = i > 0 ? monthly[sorted[i - 1]].size : 0;
    const growth = prev ? ((stats.size - prev) / prev) * 100 : 0;

    result.push({
      month: m,
      uploads: stats.count,
      addedSize: stats.size,
      totalSize: total,
      growthPct: growth,
    });
  }

  return result;
}

/** Top N consumers */
export function top<T extends string | DatabaseId>(
  map: Record<T, SizeCount>,
  n = 10,
): Array<{ key: T } & SizeCount> {
  return Object.entries<SizeCount>(map)
    .map(([k, v]) => ({ key: k as T, ...v }))
    .sort((a, b) => b.size - a.size)
    .slice(0, n);
}

// ─── Backward-compatibility aliases ──────────────────────────────────────

/** @deprecated Use `generateInsights()` instead. */
export const insights = generateInsights;

// ─── Quota ────────────────────────────────────────────────────────────────

/** Simple quota usage */
export function quota(current: number, limit: number) {
  const pct = limit ? (current / limit) * 100 : 0;
  let status: "healthy" | "warning" | "critical" = "healthy";
  if (pct > 90) {
    status = "critical";
  } else if (pct > 70) {
    status = "warning";
  }

  return {
    used: current,
    available: limit - current,
    percentage: pct,
    status,
  };
}
