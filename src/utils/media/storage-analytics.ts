/**
 * @file src/utils/media/storage-analytics.ts
 * @description Storage analytics computed by the database instead of in JS.
 *
 * Features:
 * - Aggregation pipeline builders for total / type / folder / user / month rollups
 * - Breakdown assembly from grouped counters (percentages against the tenant total)
 * - Monthly trend series from a 12-bucket month rollup
 * - Actionable insights from bounded, condition-targeted samples
 * - Quota monitoring
 *
 * ### Why pipelines
 * The previous implementation loaded up to 2,000 media rows into JS just to count
 * them. The builders below group in the database — MongoDB natively, SQL through
 * `core/aggregation-translator.ts` / `core/sql-aggregate.ts` — so only one row per
 * group key crosses the adapter boundary.
 *
 * ### Bounded sample
 * `insights()` needs asset ids for its `action.data` payload, and the supported
 * `$group` subset cannot return a list of ids per bucket. The handler therefore
 * feeds it at most `MEDIA_ANALYTICS_INSIGHT_SAMPLE_LIMIT` *matching* files per
 * insight (large files, old files) rather than an arbitrary page, so neither
 * insight disappears when the library is larger than the cap. Counts and sizes in
 * those two cards are exact up to the cap.
 */

import type { DatabaseId, ISODateString } from "@src/databases/db-interface";
import { nowISODateString } from "@utils/date";
import { formatBytes } from "../file";
import { mediaTypeFromMime } from "./media-values";

/** Collection name; every SQL adapter maps it to `media_items`. */
export const MEDIA_ANALYTICS_COLLECTION = "media";

/** Media types rendered by the dashboard widget. */
export const MEDIA_ANALYTICS_TOP_TYPES = 5;

/** Folders/users kept per rollup. The response contract does not expose them yet. */
export const MEDIA_ANALYTICS_FOLDER_LIMIT = 50;
export const MEDIA_ANALYTICS_USER_LIMIT = 50;

/** Month buckets kept for the trend series (the handler returns the last 12). */
export const MEDIA_ANALYTICS_TREND_MONTHS = 12;

/** Files fed to `insights()` per insight. See the module note on the bounded sample. */
export const MEDIA_ANALYTICS_INSIGHT_SAMPLE_LIMIT = 500;

/** Threshold for the "Large Files" insight. */
export const MEDIA_ANALYTICS_LARGE_FILE_BYTES = 10 * 1024 * 1024;

/** Fields the breakdown pipelines group by. */
export type MediaBreakdownField = "mimeType" | "folderId" | "createdBy";

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

/** One row from the `$group: { _id: null }` total pipeline. */
export interface MediaTotalRow {
  _id: null;
  files: number;
  size: number;
}

/** One row from a breakdown pipeline (`_id` is the group key, or null). */
export interface MediaGroupRow {
  _id: string | null;
  files: number;
  size: number;
}

/** One row from the monthly pipeline (`_id` is `YYYY-MM`; null for undated rows). */
export interface MediaMonthRow {
  _id: string | null;
  files: number;
  size: number;
}

/** The row projection `insights()` actually reads. */
export interface MediaInsightRow {
  _id: DatabaseId;
  createdAt?: ISODateString;
  size?: number;
}

// ─── Pipelines ───────────────────────────────────────────────────────────────

/** Tenant scope carried inside the pipeline (the adapter also scopes via options). */
const tenantMatch = (tenantId: DatabaseId): Record<string, unknown> => ({
  $match: { tenantId },
});

const groupCounters = (id: unknown): Record<string, unknown> => ({
  $group: { _id: id, files: { $sum: 1 }, size: { $sum: "$size" } },
});

/** One `$group` over the whole tenant → `{ files, size }`. */
export function mediaTotalPipeline(tenantId: DatabaseId): Record<string, unknown>[] {
  return [tenantMatch(tenantId), groupCounters(null)];
}

/**
 * One `$group` per breakdown field, largest bucket first.
 *
 * Types are grouped by `mimeType` (the stored column) rather than by the derived
 * media type: media rows have no `type` column, so `image/png` and `image/jpeg`
 * stay separate here and are merged into `image` in `breakdownFromAggregates()`.
 * They are therefore not limited; `limit: 0` means "all distinct MIME types",
 * which is naturally bounded by the MIME catalogue.
 */
export function mediaBreakdownPipeline(
  tenantId: DatabaseId,
  field: MediaBreakdownField,
  limit = 0,
): Record<string, unknown>[] {
  const pipeline: Record<string, unknown>[] = [
    tenantMatch(tenantId),
    groupCounters(`$${field}`),
    { $sort: { size: -1 } },
  ];
  if (limit > 0) pipeline.push({ $limit: limit });
  return pipeline;
}

/**
 * Monthly buckets, newest first and capped at `months`.
 *
 * `$toDate` keeps the same pipeline valid for MongoDB, where `createdAt` is an
 * ISO string; SQL translators read the native timestamp column directly.
 */
export function mediaMonthlyPipeline(
  tenantId: DatabaseId,
  months = MEDIA_ANALYTICS_TREND_MONTHS,
): Record<string, unknown>[] {
  return [
    tenantMatch(tenantId),
    groupCounters({
      $dateToString: { format: "%Y-%m", date: { $toDate: "$createdAt" } },
    }),
    { $sort: { _id: -1 } },
    { $limit: months },
  ];
}

// ─── Assembly ────────────────────────────────────────────────────────────────

/**
 * Coerce a driver counter to a finite number.
 *
 * JSON aggregation (Mongo) returns numbers, but SQL drivers do not agree:
 * PostgreSQL `postgres.js` and MariaDB `mysql2` may hand back `SUM(...)` as a
 * string (int8/DECIMAL). The analytics contract is numeric, so normalise here
 * instead of leaking "3000" into `formatBytes`/quota maths.
 */
function toFiniteNumber(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

/** Add storage-share percentages; an empty total keeps the map empty. */
function addPct(
  counts: Record<string, SizeCount>,
  totalSize: number,
): Record<string, PctSizeCount> {
  const result: Record<string, PctSizeCount> = Object.create(null) as Record<string, PctSizeCount>;
  if (totalSize <= 0) return result;
  for (const key of Object.keys(counts)) {
    const entry = counts[key];
    result[key] = { count: entry.count, size: entry.size, pct: (entry.size / totalSize) * 100 };
  }
  return result;
}

/** Fold grouped rows into `{ key: { count, size } }`; `null` keys are skipped. */
function toSizeCounts(
  rows: readonly MediaGroupRow[],
  keyOf: (row: MediaGroupRow) => string | null,
): Record<string, SizeCount> {
  const counts: Record<string, SizeCount> = Object.create(null) as Record<string, SizeCount>;
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null || key === "") continue;
    const entry = (counts[key] ??= { count: 0, size: 0 });
    entry.count += toFiniteNumber(row.files);
    entry.size += toFiniteNumber(row.size);
  }
  return counts;
}

export interface MediaAggregateBreakdownInput {
  folderRows?: readonly MediaGroupRow[];
  monthRows?: readonly MediaMonthRow[];
  /** Total row; when absent (a failed total query) it is derived from `typeRows`. */
  total?: MediaTotalRow;
  typeRows?: readonly MediaGroupRow[];
  userRows?: readonly MediaGroupRow[];
}

/** Build the `Breakdown` contract from the already-grouped database counters. */
export function breakdownFromAggregates(input: MediaAggregateBreakdownInput): Breakdown {
  const typeRows = input.typeRows ?? [];
  const folderRows = input.folderRows ?? [];
  const userRows = input.userRows ?? [];
  const monthRows = input.monthRows ?? [];

  // A failed total query must not zero the dashboard when the type rollup
  // succeeded: the type rows already carry the exact tenant totals.
  let derivedFiles = 0;
  let derivedSize = 0;
  for (const row of typeRows) {
    derivedFiles += toFiniteNumber(row.files);
    derivedSize += toFiniteNumber(row.size);
  }
  const files = input.total ? toFiniteNumber(input.total.files) : derivedFiles;
  const size = input.total ? toFiniteNumber(input.total.size) : derivedSize;

  const byUser = addPct(
    toSizeCounts(userRows, (row) => (row._id === null ? null : String(row._id))),
    size,
  ) as Record<DatabaseId, PctSizeCount>;

  const byMonth: Record<string, SizeCount> = Object.create(null) as Record<string, SizeCount>;
  for (const row of monthRows) {
    if (row._id === null || row._id === "") continue;
    byMonth[row._id] = { count: toFiniteNumber(row.files), size: toFiniteNumber(row.size) };
  }

  return {
    byType: addPct(
      toSizeCounts(typeRows, (row) => mediaTypeFromMime(String(row._id ?? ""))),
      size,
    ),
    byFolder: addPct(
      toSizeCounts(folderRows, (row) => (row._id === null ? "root" : String(row._id))),
      size,
    ),
    byUser,
    byMonth,
    total: {
      files,
      size,
      avgSize: files ? size / files : 0,
    },
  };
}

/** Monthly trend series from the month rollup, ascending with a running total. */
export function trendsFromMonthly(rows: readonly MediaMonthRow[]): Trend[] {
  const months = rows
    .filter(
      (row): row is MediaMonthRow & { _id: string } =>
        typeof row._id === "string" && row._id !== "",
    )
    .sort((a, b) => a._id.localeCompare(b._id));
  const result: Trend[] = [];
  let total = 0;

  for (let i = 0; i < months.length; i++) {
    const stats = months[i];
    const addedSize = toFiniteNumber(stats.size);
    total += addedSize;

    const prev = i > 0 ? toFiniteNumber(months[i - 1].size) : 0;
    const growth = prev ? ((addedSize - prev) / prev) * 100 : 0;

    result.push({
      month: stats._id,
      uploads: toFiniteNumber(stats.files),
      addedSize,
      totalSize: total,
      growthPct: growth,
    });
  }

  return result;
}

/** Generate insight cards from the bounded sample and the exact type breakdown. */
export function insights(rows: readonly MediaInsightRow[], breakdown: Breakdown): Insight[] {
  const list: Insight[] = [];

  // Large files (>10MB)
  const large = rows.filter((row) => toFiniteNumber(row.size) > MEDIA_ANALYTICS_LARGE_FILE_BYTES);
  if (large.length) {
    const size = large.reduce((sum, row) => sum + toFiniteNumber(row.size), 0);
    list.push({
      type: "info",
      title: "Large Files",
      desc: `${large.length} files >10MB (${formatBytes(size)})`,
      actionable: true,
      action: { label: "View", data: large.map((row) => row._id) },
    });
  }

  // Old files (>1 year)
  const yearAgo = new Date(nowISODateString());
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const old = rows.filter((row) => row.createdAt && new Date(row.createdAt) < yearAgo);
  if (old.length) {
    const size = old.reduce((sum, row) => sum + toFiniteNumber(row.size), 0);
    list.push({
      type: "info",
      title: "Old Files",
      desc: `${old.length} files >1 year old (${formatBytes(size)})`,
      actionable: true,
      action: { label: "View", data: old.map((row) => row._id) },
    });
  }

  // Dominant type (from the exact database breakdown, not the sample)
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
