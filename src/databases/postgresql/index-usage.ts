/**
 * @file src/databases/postgresql/index-usage.ts
 * @description Pure PostgreSQL index-usage provenance, report SQL, and summarization.
 *
 * The lazy index schedulers (`onDynamicSort`, `schedulePublishedListIndex`,
 * `scheduleListSortIndex`) create indexes on first use and never revisit them.
 * A CMS that auto-creates indexes must be able to answer which of those trees
 * nothing queries; this module is the pure half of that answer (no DB access).
 *
 * Features:
 * - Name-based provenance classifier: primary / unique / declared / lazy-sort /
 *   lazy-published-list / gin / unknown, including `pgSafeIndexName` truncation
 * - `pg_stat_user_indexes` report SQL that excludes primary and unique indexes
 * - Observation-window SQL derived from `pg_stat_database.stats_reset`
 * - Pure summarizer: per-provenance counts, top-N-by-size, prunable candidates
 */

import { assertSafeSqlIdentifier } from "@src/databases/core/relational-utils";

/** Origin of a PostgreSQL index, inferred from its name contract. */
export type IndexProvenance =
  | "primary"
  | "unique"
  | "declared"
  | "lazy-sort"
  | "lazy-published-list"
  | "gin"
  | "unknown";

/** Stable iteration order for report output and summary records. */
export const INDEX_PROVENANCES = [
  "primary",
  "unique",
  "declared",
  "lazy-sort",
  "lazy-published-list",
  "gin",
  "unknown",
] as const satisfies readonly IndexProvenance[];

/** Provenances the opt-in pruner may drop: only the lazy scheduler's trees. */
export const PRUNABLE_PROVENANCES: ReadonlySet<IndexProvenance> = new Set([
  "lazy-sort",
  "lazy-published-list",
]);

/**
 * `pgSafeIndexName` truncates names above NAMEDATALEN=63 to 54 characters plus
 * `_<8 lowercase hex>`. The tail marker (`_expr_idx`, `_pub_list_id`) is lost,
 * so truncated names are classified from the surviving prefix instead.
 */
const PG_HASHED_NAME_RE = /^(.{54})_[0-9a-f]{8}$/;

/**
 * Classify an index by the naming contract of the code that creates it.
 *
 * The rule order is deliberate: every protection boundary (primary, unique,
 * GIN) is checked before the lazy markers, so a name that could belong to a
 * protected family is never reported as prunable. `DROP INDEX` safety also
 * relies on the report SQL filtering `indisprimary`/`indisunique`; this
 * classifier is a second, name-based layer.
 */
export function classifyProvenance(indexName: string, tableName: string): IndexProvenance {
  if (!indexName || !tableName) return "unknown";
  const tablePrefix = `${tableName}_`;

  // PostgreSQL's implicit primary key index (`<table>_pkey`, `<table>_pkey1`).
  if (indexName === `${tableName}_pkey` || indexName.startsWith(`${tableName}_pkey`)) {
    return "primary";
  }

  // Uniqueness is a hard protection boundary. System-schema unique indexes end
  // in `_unique`; PostgreSQL constraint defaults end in `_key`; the redirects
  // lookup is the one named unique index in the system schema.
  if (
    indexName.endsWith("_unique") ||
    /_key\d*$/.test(indexName) ||
    indexName === `idx_${tableName}_lookup`
  ) {
    return "unique";
  }

  // GIN trees are JSONB containment / full-text structures, never prunable.
  // `_fts_idx` is the GIN name the system schema chose for content_nodes.
  if (indexName.endsWith("_gin") || indexName.endsWith("_fts_idx")) return "gin";

  // Lazy families require the table prefix: a plugin index that happens to end
  // in `_list_id` must never be mistaken for a published-list partial index.
  if (indexName.startsWith(tablePrefix)) {
    if (indexName.endsWith("_expr_idx")) return "lazy-sort";
    if (indexName.endsWith("_list_id")) return "lazy-published-list";
    // Legacy schema-sync twins (`..._tenant_status_updated`, `..._tenant_updated`)
    // are dropped by provisioning; until then they are declared-family btrees.
    if (
      indexName === `${tablePrefix}tenant_status_updated` ||
      indexName === `${tablePrefix}tenant_updated`
    ) {
      return "declared";
    }
    if (
      (indexName.startsWith(`${tablePrefix}tenant_status_`) ||
        indexName.startsWith(`${tablePrefix}tenant_updated_`)) &&
      indexName.endsWith("_id")
    ) {
      return "declared";
    }
  }

  // Declarative contract: schema-sync and system-schema btrees (`_idx`) and
  // the audit_logs BRIN (`_brin`) are all provisioned from the schema.
  if (indexName.endsWith("_idx") || indexName.endsWith("_brin")) return "declared";

  // A truncated name keeps its table prefix and the start of the marker. The
  // live benchmark DB has e.g. `collection_plugin_redirectmanager_404_logs_tenant_stat_c6cfbd07`.
  const hashed = PG_HASHED_NAME_RE.exec(indexName);
  if (hashed && indexName.startsWith(tablePrefix)) {
    const rest = hashed[1].slice(tablePrefix.length);
    if (rest.startsWith("tenant_")) return "declared";
    if (rest.includes("_expr_") || rest.endsWith("_expr")) return "lazy-sort";
    if (rest.includes("_list_") || rest.endsWith("_list")) return "lazy-published-list";
    if (rest.startsWith("data_gi") || rest.endsWith("_gin")) return "gin";
  }

  return "unknown";
}

/**
 * Report SQL: every non-primary/non-unique index in `schema`, largest first.
 *
 * `pg_stat_user_indexes` carries the scan counter; `pg_class`/`pg_index`
 * confirm the relation is an index and let us exclude the two protected
 * families structurally (not only by name). System schemas are excluded.
 */
export function buildUnusedIndexReportSql(schema: string): string {
  const safeSchema = assertSafeSqlIdentifier(schema, "schema");
  return `SELECT
  s.schemaname,
  s.relname,
  s.indexrelname,
  s.idx_scan,
  pg_relation_size(s.indexrelid) AS index_size_bytes
FROM pg_stat_user_indexes AS s
JOIN pg_class AS c ON c.oid = s.indexrelid AND c.relkind IN ('i', 'I')
JOIN pg_index AS i ON i.indexrelid = s.indexrelid
WHERE s.schemaname = '${safeSchema}'
  AND s.schemaname NOT IN ('pg_catalog', 'information_schema')
  AND i.indisprimary = false
  AND i.indisunique = false
ORDER BY pg_relation_size(s.indexrelid) DESC, s.indexrelname ASC`;
}

/**
 * Observation-window SQL: how long the counters in `pg_stat_user_indexes`
 * have been accumulating. `stats_reset` is NULL when statistics were never
 * explicitly reset, so the postmaster start time is the conservative window
 * start. The pruner refuses to act until this window is old enough.
 */
export function buildIndexObservationWindowSql(): string {
  return `SELECT
  COALESCE(d.stats_reset, pg_postmaster_start_time()) AS stats_reset,
  EXTRACT(EPOCH FROM (now() - COALESCE(d.stats_reset, pg_postmaster_start_time()))) AS observation_seconds
FROM pg_stat_database AS d
WHERE d.datname = current_database()`;
}

/** One row of `buildUnusedIndexReportSql` (bigint columns arrive as strings). */
export interface IndexUsageRow {
  schemaname: string;
  relname: string;
  indexrelname: string;
  idx_scan: number | string | bigint | null;
  index_size_bytes: number | string | bigint | null;
}

/** An unused index, with its inferred provenance and size. */
export interface UnusedIndexEntry {
  schemaname: string;
  table: string;
  index: string;
  provenance: IndexProvenance;
  sizeBytes: number;
}

/** Per-provenance counters across all rows, plus the unused subset. */
export interface ProvenanceUsage {
  total: number;
  unused: number;
  unusedBytes: number;
}

/** Aggregated view of the index-usage report rows. */
export interface UnusedIndexSummary {
  totalIndexes: number;
  unusedIndexes: number;
  unusedBytes: number;
  countsByProvenance: Record<IndexProvenance, ProvenanceUsage>;
  topUnusedBySize: UnusedIndexEntry[];
  /** Unused lazy-sort / lazy-published-list indexes, largest first. */
  prunable: UnusedIndexEntry[];
  prunableIndexes: number;
  prunableBytes: number;
}

export interface SummarizeUnusedIndexOptions {
  /** Number of largest unused indexes to return (default 5). */
  topN?: number;
}

function toNonNegativeNumber(value: number | string | bigint | null | undefined): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "bigint"
        ? Number(value)
        : Number(value ?? 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function bySizeDescending(a: UnusedIndexEntry, b: UnusedIndexEntry): number {
  if (a.sizeBytes !== b.sizeBytes) return b.sizeBytes - a.sizeBytes;
  return a.index < b.index ? -1 : a.index > b.index ? 1 : 0;
}

/**
 * Summarize report rows without touching a database.
 *
 * `idx_scan === 0` is the unused test. Primary/unique/declared/GIN/unknown
 * indexes still count toward the report, but only the two lazy provenances
 * land in `prunable` — the opt-in pruner's entire candidate set.
 */
export function summarizeUnusedIndexes(
  rows: readonly IndexUsageRow[],
  options: SummarizeUnusedIndexOptions = {},
): UnusedIndexSummary {
  const topN = Math.max(0, Math.trunc(options.topN ?? 5));
  const countsByProvenance = Object.fromEntries(
    INDEX_PROVENANCES.map((provenance) => [provenance, { total: 0, unused: 0, unusedBytes: 0 }]),
  ) as Record<IndexProvenance, ProvenanceUsage>;

  const unused: UnusedIndexEntry[] = [];
  const prunable: UnusedIndexEntry[] = [];
  let totalIndexes = 0;
  let unusedBytes = 0;

  for (const row of rows) {
    const provenance = classifyProvenance(row.indexrelname, row.relname);
    const sizeBytes = toNonNegativeNumber(row.index_size_bytes);
    const scans = toNonNegativeNumber(row.idx_scan);

    totalIndexes++;
    const usage = countsByProvenance[provenance];
    usage.total++;

    if (scans > 0) continue;

    const entry: UnusedIndexEntry = {
      schemaname: row.schemaname,
      table: row.relname,
      index: row.indexrelname,
      provenance,
      sizeBytes,
    };
    unused.push(entry);
    unusedBytes += sizeBytes;
    usage.unused++;
    usage.unusedBytes += sizeBytes;
    if (PRUNABLE_PROVENANCES.has(provenance)) prunable.push(entry);
  }

  unused.sort(bySizeDescending);
  prunable.sort(bySizeDescending);

  return {
    totalIndexes,
    unusedIndexes: unused.length,
    unusedBytes,
    countsByProvenance,
    topUnusedBySize: unused.slice(0, topN),
    prunable,
    prunableIndexes: prunable.length,
    prunableBytes: prunable.reduce((sum, entry) => sum + entry.sizeBytes, 0),
  };
}
