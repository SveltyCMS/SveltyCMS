/**
 * @file src/services/background/index-usage.server.ts
 * @description One-shot boot-time report of unused PostgreSQL indexes, with an opt-in pruner.
 *
 * ## Why this exists
 * The lazy index schedulers only ever `CREATE INDEX`: nothing revisits whether
 * a tree is still queried. On the local benchmark DB, `collection_BenchmarkStable`
 * held 3.2k live rows / 2.4 MB heap but 4.6 GB of indexes, ~4.3 GB of them with
 * `idx_scan = 0`. Every write maintained those trees for dead entries. A CMS
 * that provisions indexes on the fly must be able to name the ones nothing reads.
 *
 * ## Policy
 * - Report once at boot, fire-and-forget, never on the request path.
 * - One info line: counts + the five largest `idx_scan = 0` indexes with size.
 *   Debug when nothing is unused (no log spam on healthy databases).
 * - Pruning is default OFF. `SVELTY_UNUSED_INDEX_PRUNE=1` enables it, but only
 *   when the stats observation window is at least `SVELTY_UNUSED_INDEX_MIN_AGE_DAYS`
 *   (default 30) and only for `lazy-sort` / `lazy-published-list` provenances.
 *   Primary, unique, declared, GIN, and unknown indexes are never dropped.
 * - Every failure is contained and logged at debug: boot must not depend on
 *   `pg_stat_user_indexes` being readable.
 *
 * Env:
 * - `SVELTY_INDEX_USAGE_REPORT=0` — disable the report entirely.
 * - `SVELTY_UNUSED_INDEX_PRUNE=1` — enable the bounded pruner.
 * - `SVELTY_UNUSED_INDEX_MIN_AGE_DAYS` — minimum stats window before pruning (default 30).
 * - `SVELTY_INDEX_USAGE_SCHEMA` — schema to inspect (default `public`).
 */

import { logger } from "@utils/logger";
import { formatBytes } from "@utils/file";
import { assertSafeSqlIdentifier } from "@src/databases/core/relational-utils";
import {
  buildIndexObservationWindowSql,
  buildUnusedIndexReportSql,
  INDEX_PROVENANCES,
  summarizeUnusedIndexes,
  type IndexUsageRow,
  type UnusedIndexSummary,
} from "@src/databases/postgresql/index-usage";

/** Structural subset of the PostgreSQL adapter this reporter needs. */
export interface IndexUsageAdapter {
  type?: string;
  raw?: {
    execute: (sqlText: string, params?: unknown[]) => Promise<unknown>;
  };
}

export interface IndexUsageReport {
  summary: UnusedIndexSummary;
  schema: string;
  observationSeconds: number;
  dropped: string[];
}

const DEFAULT_MIN_OBSERVATION_DAYS = 30;
const MAX_DROPS_PER_RUN = 8;
const REPORT_TOP_N = 5;
const SECONDS_PER_DAY = 86_400;

/**
 * Start the single-shot reporter. Returns immediately; the catalog read and
 * any drops run in the background and can never reject into boot.
 */
export function startIndexUsageReporter(adapter: IndexUsageAdapter | null | undefined): void {
  if (process.env.SVELTY_INDEX_USAGE_REPORT === "0") return;
  if (adapter?.type !== "postgresql") return;
  if (typeof adapter.raw?.execute !== "function") return;

  void reportUnusedIndexes(adapter).catch((error: unknown) => {
    logger.debug(`[IndexUsage] report skipped: ${describeError(error)}`);
  });
}

/**
 * Read `pg_stat_user_indexes`, log one line, and optionally drop bounded lazy
 * indexes. Exported for diagnostics; boot uses `startIndexUsageReporter`.
 */
export async function reportUnusedIndexes(
  adapter: IndexUsageAdapter,
  options: { env?: Record<string, string | undefined> } = {},
): Promise<IndexUsageReport | null> {
  if (adapter.type !== "postgresql") return null;
  const raw = adapter.raw;
  if (!raw || typeof raw.execute !== "function") return null;

  const env = options.env ?? process.env;
  const schema = resolveSchema(env);

  const rawRows = await raw.execute(buildUnusedIndexReportSql(schema));
  const rows: IndexUsageRow[] = Array.isArray(rawRows) ? (rawRows as IndexUsageRow[]) : [];

  const rawWindow = await raw.execute(buildIndexObservationWindowSql());
  const windowRow =
    Array.isArray(rawWindow) && rawWindow.length > 0
      ? (rawWindow[0] as { observation_seconds?: unknown })
      : undefined;
  const observationSeconds = toNonNegativeNumber(windowRow?.observation_seconds);

  const summary = summarizeUnusedIndexes(rows, { topN: REPORT_TOP_N });
  const dropped: string[] = [];

  if (summary.unusedIndexes === 0) {
    logger.debug(
      `[IndexUsage] no unused indexes across ${summary.totalIndexes} index(es) in schema "${schema}" (window ${formatWindow(observationSeconds)})`,
    );
  } else {
    logger.info(formatReportLine(summary, schema, observationSeconds));
  }

  if (env.SVELTY_UNUSED_INDEX_PRUNE === "1") {
    const minAgeDays = positiveInteger(
      env.SVELTY_UNUSED_INDEX_MIN_AGE_DAYS,
      DEFAULT_MIN_OBSERVATION_DAYS,
    );
    const minimumSeconds = minAgeDays * SECONDS_PER_DAY;

    if (observationSeconds < minimumSeconds) {
      logger.debug(
        `[IndexUsage] prune skipped: observation window ${formatWindow(observationSeconds)} < ${minAgeDays}d`,
      );
    } else {
      const safeSchema = assertSafeSqlIdentifier(schema, "schema");
      const candidates = summary.prunable.slice(0, MAX_DROPS_PER_RUN);
      for (const entry of candidates) {
        try {
          const safeIndex = assertSafeSqlIdentifier(entry.index, "index");
          // Only ever lazy-sort / lazy-published-list: summarizeUnusedIndexes
          // keeps primary/unique/declared/gin/unknown out of `prunable`.
          await raw.execute(`DROP INDEX CONCURRENTLY IF EXISTS "${safeSchema}"."${safeIndex}"`);
          dropped.push(safeIndex);
          logger.info(
            `[IndexUsage] dropped unused ${entry.provenance} index "${safeIndex}" on "${entry.table}" (${formatBytes(entry.sizeBytes)}, idx_scan=0, window ${formatWindow(observationSeconds)})`,
          );
        } catch (error) {
          logger.warn(`[IndexUsage] drop failed for "${entry.index}": ${describeError(error)}`);
        }
      }
    }
  }

  return { summary, schema, observationSeconds, dropped };
}

function formatReportLine(
  summary: UnusedIndexSummary,
  schema: string,
  observationSeconds: number,
): string {
  const unusedByProvenance = INDEX_PROVENANCES.filter(
    (provenance) => summary.countsByProvenance[provenance].unused > 0,
  )
    .map((provenance) => `${provenance}=${summary.countsByProvenance[provenance].unused}`)
    .join(", ");

  const topUnused = summary.topUnusedBySize
    .map(
      (entry) =>
        `${entry.index} [${entry.table}, ${entry.provenance}] ${formatBytes(entry.sizeBytes)}`,
    )
    .join("; ");

  return `[IndexUsage] schema "${schema}": ${summary.totalIndexes} index(es), ${summary.unusedIndexes} unused (${formatBytes(summary.unusedBytes)}), prunable ${summary.prunableIndexes} (${formatBytes(summary.prunableBytes)}); unused by provenance: ${unusedByProvenance || "none"}; window ${formatWindow(observationSeconds)}; top unused: ${topUnused || "none"}`;
}

function resolveSchema(env: Record<string, string | undefined>): string {
  const configured = env.SVELTY_INDEX_USAGE_SCHEMA?.trim();
  return configured || "public";
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw?.trim());
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function toNonNegativeNumber(value: unknown): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "bigint"
        ? Number(value)
        : Number(value ?? 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function formatWindow(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "unknown";
  if (seconds < 3_600) return `${Math.round(seconds / 60)}m`;
  if (seconds < SECONDS_PER_DAY) return `${(seconds / 3_600).toFixed(1)}h`;
  return `${(seconds / SECONDS_PER_DAY).toFixed(1)}d`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
