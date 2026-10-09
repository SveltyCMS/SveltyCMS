/**
 * @file src/databases/postgresql/statement-warmup.ts
 * @description Phase-1 boot statement warm-up for PostgreSQL prepared statements.
 *
 * PostgreSQL's planner builds a *custom* plan for the first 5 executions of a
 * prepared statement and only then compares it against the *generic* plan.
 * On a fresh pool (boot, deploy, idle-timeout reconnect) every connection pays
 * the measured 0.3–0.36 ms custom-plan bind penalty for its first 5 runs.
 *
 * This module executes the hottest statement shapes 6× per pooled connection
 * right after boot so the planner has already switched to generic plans before
 * the first request arrives.
 *
 * ### Safety (stats-poisoning trap)
 * - All probes are pk-equality or `LIMIT 0` — an index probe with zero rows,
 *   never a scan, never buffer-cache pollution.
 * - The update probe targets an impossible UUIDv7 (`00000000-…`) and is a
 *   `SET "updatedAt" = "updatedAt"` no-op, so no row is ever written.
 * - Probes run against the system table `content_nodes` only.
 * - Non-fatal by contract: callers catch and log at debug.
 *
 * Env gate: `SVELTY_PG_STATEMENT_WARMUP=0` disables (A/B control lane).
 */

/** Minimal structural contract of the postgres.js client (mockable in tests). */
export interface PreparedStatementExecutor {
  unsafe(query: string, params?: unknown[], options?: { prepare?: boolean }): Promise<unknown[]>;
}

export const PG_STATEMENT_WARMUP_ENV = "SVELTY_PG_STATEMENT_WARMUP";

/** How often each probe runs per connection — above the planner's 5-run window. */
export const WARMUP_REPETITIONS = 6;

/**
 * A UUIDv7 version nibble is `7` at index 12; the all-zero UUID has version 0,
 * so it can never match a generated row — the update probe is write-free.
 */
export const IMPOSSIBLE_ID = "00000000-0000-0000-0000-000000000000";

interface WarmupProbe {
  label: string;
  sqlText: string;
  params: unknown[];
}

/** Hottest statement classes, quoted camelCase columns against `content_nodes`. */
const WARMUP_PROBES: readonly WarmupProbe[] = [
  {
    label: "point-read",
    sqlText:
      'SELECT "_id", "status", "data" FROM content_nodes WHERE "_id" = $1 AND "tenantId" = $2 LIMIT 1',
    params: [IMPOSSIBLE_ID, "global"],
  },
  {
    label: "pk-probe",
    sqlText: 'SELECT "_id" FROM content_nodes WHERE "_id" = $1 LIMIT 0',
    params: [IMPOSSIBLE_ID],
  },
  {
    label: "update-noop",
    sqlText:
      'UPDATE content_nodes SET "updatedAt" = "updatedAt" WHERE "_id" = $1 AND "tenantId" = $2',
    params: [IMPOSSIBLE_ID, "global"],
  },
  {
    label: "list-filter-sort",
    sqlText:
      'SELECT "_id", "status", "updatedAt" FROM content_nodes WHERE "tenantId" = $1 AND "status" = $2 ORDER BY "updatedAt" DESC LIMIT $3',
    params: ["global", "draft", 0],
  },
];

export interface WarmupStats {
  /** Prepared statements already serving generic plans after warm-up. */
  warmed: number;
  /** Total prepared statements tracked by the server. */
  total: number;
}

/**
 * Runs the probe set `WARMUP_REPETITIONS` times on `poolMax` concurrent tasks
 * so every pooled connection crosses the custom→generic plan threshold.
 * Returns server-side prepared-statement counters (generic vs custom plans).
 */
export async function warmPgPreparedStatements(
  exec: PreparedStatementExecutor,
  poolMax: number,
): Promise<WarmupStats> {
  const connections = Math.max(1, Math.floor(poolMax) || 1);
  const warmOneConnection = async (): Promise<void> => {
    for (let rep = 0; rep < WARMUP_REPETITIONS; rep++) {
      for (const probe of WARMUP_PROBES) {
        await exec.unsafe(probe.sqlText, probe.params, { prepare: true });
      }
    }
  };

  await Promise.all(Array.from({ length: connections }, () => warmOneConnection()));

  const rows = await exec.unsafe(
    "SELECT count(*)::int AS total, count(*) FILTER (WHERE generic_plans > 0)::int AS warmed FROM pg_prepared_statements",
  );
  const row = (rows?.[0] ?? { total: 0, warmed: 0 }) as { total: number; warmed: number };
  return { total: row.total, warmed: row.warmed };
}
