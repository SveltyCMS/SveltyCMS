/**
 * @file src/services/analytics/collection-analytics-service.ts
 * @description Collection-driven analytics service powering dynamic dashboard widgets.
 *
 * Provides aggregated figures (count/sum/avg/min/max with period comparison and goals),
 * time-series and categorical charts (columns/bars/lines), and filtered entity lists
 * for any collection in the CMS with full tenant isolation and RBAC.
 *
 * Features:
 * - Dynamic collection metadata introspection (number, date, category fields)
 * - Flexible time periods (today, week, month, year, last30, last12m, custom)
 * - Previous period comparison (+/- % change) and goal progress tracking
 * - Time-series binning (day, week, month, year) and categorical grouping
 * - Sparkline data-point generation for micro-visualizations
 * - Zero external chart dependencies (pure SVG/CSS rendering support)
 */

import type { DatabaseId, FieldInstance } from "@src/content/types";
import type { LocalCMS } from "@src/services/sdk";
import { contentStore } from "@src/stores/content-registry.svelte";
import { toISOString } from "@src/utils/date";

export interface CollectionFieldMeta {
  name: string;
  label: string;
  type: string;
  options?: string[];
}

export interface CollectionSourceInfo {
  id: string;
  name: string;
  label: string;
  icon: string;
  numberFields: CollectionFieldMeta[];
  dateFields: CollectionFieldMeta[];
  categoryFields: CollectionFieldMeta[];
}

export type AnalyticsPeriod =
  | "all"
  | "today"
  | "week"
  | "month"
  | "year"
  | "last30"
  | "last12m"
  | "custom";

export type MetricMeasure = "count" | "sum" | "avg" | "min" | "max";

export interface MetricQueryOptions {
  collectionId: string;
  tenantId?: DatabaseId | null;
  user?: unknown;
  measure?: MetricMeasure;
  field?: string;
  period?: AnalyticsPeriod;
  dateField?: string;
  startDate?: string;
  endDate?: string;
  compare?: "previous" | "none";
  goal?: number;
  filter?: Record<string, unknown>;
}

export interface MetricQueryResult {
  value: number;
  formattedValue: string;
  previousValue?: number;
  pctChange?: number;
  trend?: "up" | "down" | "neutral";
  goal?: number;
  pctGoal?: number;
  remaining?: number;
  sparkline?: number[];
  periodLabel: string;
  measure: MetricMeasure;
  field?: string;
}

export interface ChartQueryOptions {
  collectionId: string;
  tenantId?: DatabaseId | null;
  user?: unknown;
  groupBy?: "time" | "field";
  groupField?: string;
  timeGranularity?: "day" | "week" | "month" | "year";
  measure?: "count" | "sum" | "avg";
  metricField?: string;
  period?: AnalyticsPeriod;
  dateField?: string;
  filter?: Record<string, unknown>;
  limit?: number;
}

export interface ChartSeriesItem {
  label: string;
  value: number;
  pct: number;
  color?: string;
}

export interface ChartQueryResult {
  series: ChartSeriesItem[];
  total: number;
  measure: string;
  groupBy: "time" | "field";
}

export interface ListQueryOptions {
  collectionId: string;
  tenantId?: DatabaseId | null;
  user?: unknown;
  limit?: number;
  sortField?: string;
  sortDirection?: "asc" | "desc";
  fields?: string[];
  filter?: Record<string, unknown>;
}

export interface ListQueryResult {
  items: Array<Record<string, unknown>>;
  total: number;
}

/** Standard date boundaries for time periods */
function resolveDateRange(
  period: AnalyticsPeriod,
  customStart?: string,
  customEnd?: string,
): { start: Date | null; end: Date | null; label: string } {
  const now = new Date();

  switch (period) {
    case "today": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { start, end: now, label: "Today" };
    }
    case "week": {
      const day = now.getDay() || 7;
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
      return { start, end: now, label: "This Week" };
    }
    case "month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end: now, label: "This Month" };
    }
    case "year": {
      const start = new Date(now.getFullYear(), 0, 1);
      return { start, end: now, label: "This Year" };
    }
    case "last30": {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start, end: now, label: "Last 30 Days" };
    }
    case "last12m": {
      const start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      return { start, end: now, label: "Last 12 Months" };
    }
    case "custom": {
      const start = customStart ? new Date(customStart) : null;
      const end = customEnd ? new Date(customEnd) : now;
      return { start, end, label: "Custom Range" };
    }
    case "all":
    default:
      return { start: null, end: null, label: "All Time" };
  }
}

/** Resolve preceding interval of equal duration */
function resolvePreviousRange(
  start: Date | null,
  end: Date | null,
): { prevStart: Date | null; prevEnd: Date | null } {
  if (!start || !end) return { prevStart: null, prevEnd: null };
  const durationMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime());
  const prevStart = new Date(start.getTime() - durationMs);
  return { prevStart, prevEnd };
}

/** Format numbers with appropriate unit compacting (e.g. 1.2K, 3.4M) */
export function formatMetricNumber(val: number): string {
  if (!Number.isFinite(val)) return "0";
  if (Math.abs(val) >= 1_000_000) {
    return (val / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (Math.abs(val) >= 1_000) {
    return (val / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  }
  return Number.isInteger(val) ? val.toLocaleString() : val.toFixed(2);
}

class CollectionAnalyticsService {
  /**
   * Introspects available collections and catalogs their analytical fields.
   */
  async getCollectionSources(
    _cms: LocalCMS,
    tenantId?: DatabaseId | null,
    _user?: unknown,
  ): Promise<CollectionSourceInfo[]> {
    const collections = contentStore.getCollections(tenantId as string);
    const sources: CollectionSourceInfo[] = [];

    for (const schema of collections) {
      if (!schema || !schema._id) continue;
      const fields = (schema.fields || []) as FieldInstance[];

      const numberFields: CollectionFieldMeta[] = [];
      const dateFields: CollectionFieldMeta[] = [
        { name: "createdAt", label: "Created At", type: "date" },
        { name: "updatedAt", label: "Updated At", type: "date" },
      ];
      const categoryFields: CollectionFieldMeta[] = [
        {
          name: "status",
          label: "Status",
          type: "select",
          options: ["published", "draft", "archive"],
        },
      ];

      for (const f of fields) {
        const fieldName =
          (f as { db_fieldName?: string }).db_fieldName || (f as { name?: string }).name || f.label;
        if (!fieldName) continue;
        const widgetName = f.widget?.Name || "";
        const fType = f.type || "";

        if (fType === "number" || fType === "integer" || widgetName === "Number") {
          numberFields.push({
            name: fieldName,
            label: f.label || fieldName,
            type: "number",
          });
        } else if (
          fType === "date" ||
          fType === "datetime" ||
          widgetName === "DateTime" ||
          widgetName === "Date"
        ) {
          if (!dateFields.some((df) => df.name === fieldName)) {
            dateFields.push({
              name: fieldName,
              label: f.label || fieldName,
              type: "date",
            });
          }
        } else if (
          widgetName === "Select" ||
          widgetName === "Radio" ||
          widgetName === "Checkbox" ||
          widgetName === "Relation"
        ) {
          categoryFields.push({
            name: fieldName,
            label: f.label || fieldName,
            type: widgetName.toLowerCase(),
          });
        }
      }

      sources.push({
        id: String(schema._id),
        name: schema.name || String(schema._id),
        label: schema.label || schema.name || String(schema._id),
        icon: schema.icon || "mdi:database",
        numberFields,
        dateFields,
        categoryFields,
      });
    }

    return sources;
  }

  /**
   * Computes KPI figures with period comparison, goal tracking, and sparklines.
   */
  async getMetricData(cms: LocalCMS, opts: MetricQueryOptions): Promise<MetricQueryResult> {
    const {
      collectionId,
      tenantId,
      measure = "count",
      field,
      period = "all",
      dateField = "createdAt",
      startDate,
      endDate,
      compare = "none",
      goal,
      filter = {},
      user,
    } = opts;

    const { start, end, label: periodLabel } = resolveDateRange(period, startDate, endDate);

    // Build filter query with date range
    const activeFilter: Record<string, unknown> = { ...filter };
    if (start || end) {
      const dateCond: Record<string, unknown> = {};
      if (start) dateCond.$gte = toISOString(start);
      if (end) dateCond.$lte = toISOString(end);
      activeFilter[dateField] = dateCond;
    }

    // Retrieve documents for calculation
    const findRes = await cms.collections.find(collectionId, {
      tenantId: tenantId ?? undefined,
      user,
      limit: 1000,
      filter: activeFilter,
      publicationFilter: "all",
    });

    const docs = (findRes?.success && Array.isArray(findRes.data) ? findRes.data : []) as Array<
      Record<string, unknown>
    >;

    let value = 0;
    if (measure === "count" || !field) {
      value = docs.length;
    } else {
      const nums = docs.map((d) => Number(d[field])).filter((n) => Number.isFinite(n));

      if (nums.length === 0) {
        value = 0;
      } else if (measure === "sum") {
        value = nums.reduce((a, b) => a + b, 0);
      } else if (measure === "avg") {
        value = nums.reduce((a, b) => a + b, 0) / nums.length;
      } else if (measure === "min") {
        value = Math.min(...nums);
      } else if (measure === "max") {
        value = Math.max(...nums);
      }
    }

    // Previous period calculation
    let previousValue: number | undefined;
    let pctChange: number | undefined;
    let trend: "up" | "down" | "neutral" | undefined;

    if (compare === "previous" && start && end) {
      const { prevStart, prevEnd } = resolvePreviousRange(start, end);
      const prevFilter: Record<string, unknown> = { ...filter };
      if (prevStart && prevEnd) {
        prevFilter[dateField] = {
          $gte: toISOString(prevStart),
          $lte: toISOString(prevEnd),
        };
      }

      const prevRes = await cms.collections.find(collectionId, {
        tenantId: tenantId ?? undefined,
        user,
        limit: 1000,
        filter: prevFilter,
        publicationFilter: "all",
      });

      const prevDocs = (
        prevRes?.success && Array.isArray(prevRes.data) ? prevRes.data : []
      ) as Array<Record<string, unknown>>;

      if (measure === "count" || !field) {
        previousValue = prevDocs.length;
      } else {
        const nums = prevDocs.map((d) => Number(d[field])).filter((n) => Number.isFinite(n));
        previousValue =
          nums.length > 0
            ? measure === "sum"
              ? nums.reduce((a, b) => a + b, 0)
              : measure === "avg"
                ? nums.reduce((a, b) => a + b, 0) / nums.length
                : measure === "min"
                  ? Math.min(...nums)
                  : Math.max(...nums)
            : 0;
      }

      if (previousValue > 0) {
        pctChange = Math.round(((value - previousValue) / previousValue) * 100);
      } else if (value > 0) {
        pctChange = 100;
      } else {
        pctChange = 0;
      }

      trend = pctChange > 0 ? "up" : pctChange < 0 ? "down" : "neutral";
    }

    // Goal tracking
    let pctGoal: number | undefined;
    let remaining: number | undefined;
    if (typeof goal === "number" && goal > 0) {
      pctGoal = Math.min(100, Math.round((value / goal) * 100));
      remaining = Math.max(0, goal - value);
    }

    // Generate 8-point sparkline distribution across period
    const sparkline = this.generateSparkline(docs, dateField, measure, field, start, end);

    return {
      value,
      formattedValue: formatMetricNumber(value),
      previousValue,
      pctChange,
      trend,
      goal,
      pctGoal,
      remaining,
      sparkline,
      periodLabel,
      measure,
      field,
    };
  }

  /**
   * Computes grouped chart series (bar, column, line).
   */
  async getChartData(cms: LocalCMS, opts: ChartQueryOptions): Promise<ChartQueryResult> {
    const {
      collectionId,
      tenantId,
      groupBy = "time",
      groupField = "status",
      timeGranularity = "month",
      measure = "count",
      metricField,
      period = "all",
      dateField = "createdAt",
      filter = {},
      limit = 8,
      user,
    } = opts;

    const { start, end } = resolveDateRange(period);
    const activeFilter: Record<string, unknown> = { ...filter };
    if (start || end) {
      const dateCond: Record<string, unknown> = {};
      if (start) dateCond.$gte = toISOString(start);
      if (end) dateCond.$lte = toISOString(end);
      activeFilter[dateField] = dateCond;
    }

    const findRes = await cms.collections.find(collectionId, {
      tenantId: tenantId ?? undefined,
      user,
      limit: 2000,
      filter: activeFilter,
      publicationFilter: "all",
    });

    const docs = (findRes?.success && Array.isArray(findRes.data) ? findRes.data : []) as Array<
      Record<string, unknown>
    >;

    const buckets = new Map<string, number>();

    for (const doc of docs) {
      let key = "Other";
      if (groupBy === "time") {
        const rawDate = String(doc[dateField] || doc.createdAt || "");
        if (rawDate) {
          const d = new Date(rawDate);
          if (!Number.isNaN(d.getTime())) {
            if (timeGranularity === "day") {
              key = `${d.getMonth() + 1}/${d.getDate()}`;
            } else if (timeGranularity === "week") {
              key = `W${Math.ceil(d.getDate() / 7)}`;
            } else if (timeGranularity === "year") {
              key = String(d.getFullYear());
            } else {
              key = d.toLocaleString("default", { month: "short" });
            }
          }
        }
      } else {
        const rawGroup = doc[groupField];
        key =
          rawGroup !== undefined && rawGroup !== null && String(rawGroup).trim() !== ""
            ? String(rawGroup)
            : "None";
      }

      const val = measure === "sum" && metricField ? Number(doc[metricField]) || 0 : 1;

      buckets.set(key, (buckets.get(key) || 0) + val);
    }

    let entries = Array.from(buckets.entries());
    if (groupBy === "field") {
      entries.sort((a, b) => b[1] - a[1]);
      if (entries.length > limit) {
        const top = entries.slice(0, limit);
        const otherSum = entries.slice(limit).reduce((acc, curr) => acc + curr[1], 0);
        if (otherSum > 0) top.push(["Other", otherSum]);
        entries = top;
      }
    }

    const total = entries.reduce((acc, curr) => acc + curr[1], 0);
    const series: ChartSeriesItem[] = entries.map(([label, value]) => ({
      label,
      value,
      pct: total > 0 ? Math.round((value / total) * 100) : 0,
    }));

    return {
      series,
      total,
      measure,
      groupBy,
    };
  }

  /**
   * Retrieves filtered, sorted entity lists for dashboard widgets.
   */
  async getListData(cms: LocalCMS, opts: ListQueryOptions): Promise<ListQueryResult> {
    const {
      collectionId,
      tenantId,
      limit = 5,
      sortField = "updatedAt",
      sortDirection = "desc",
      fields,
      filter = {},
      user,
    } = opts;

    const findRes = await cms.collections.find(collectionId, {
      tenantId: tenantId ?? undefined,
      user,
      limit,
      sort: sortField ? { [sortField]: sortDirection === "desc" ? -1 : 1 } : undefined,
      fields,
      filter,
      publicationFilter: "all",
    });

    const items = (findRes?.success && Array.isArray(findRes.data) ? findRes.data : []) as Array<
      Record<string, unknown>
    >;

    return {
      items,
      total: items.length,
    };
  }

  private generateSparkline(
    docs: Array<Record<string, unknown>>,
    dateField: string,
    measure: MetricMeasure,
    field: string | undefined,
    start: Date | null,
    end: Date | null,
  ): number[] {
    const BUCKETS = 8;
    const points = Array.from({ length: BUCKETS }, () => 0);
    if (docs.length === 0) return points;

    const minTime = start?.getTime() ?? Date.now() - 30 * 24 * 60 * 60 * 1000;
    const maxTime = end?.getTime() ?? Date.now();
    const interval = Math.max(1, (maxTime - minTime) / BUCKETS);

    for (const doc of docs) {
      const rawDate = String(doc[dateField] || doc.createdAt || "");
      if (!rawDate) continue;
      const t = new Date(rawDate).getTime();
      if (Number.isNaN(t)) continue;

      const idx = Math.min(BUCKETS - 1, Math.max(0, Math.floor((t - minTime) / interval)));
      const val = measure === "sum" && field ? Number(doc[field]) || 0 : 1;
      points[idx] += val;
    }

    return points;
  }
}

export const collectionAnalyticsService = new CollectionAnalyticsService();
